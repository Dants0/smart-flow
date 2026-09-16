import { callLlm, type LlmRequest, type LlmResult } from '../infra/llm';
import { AgentOutputError, parseAgentOutput } from './contracts';
import type { z } from 'zod';

/**
 * Chamada ao LLM que exige JSON no contrato do agente, com **uma** segunda
 * tentativa quando a resposta não parseia.
 *
 * Por que retentar aqui em vez de mandar o card pra ERRO: a análise custa alguns
 * milhares de tokens e um minuto de espera; jogar tudo fora porque o modelo
 * esqueceu de escapar uma quebra de linha é caro e, pro dev, indistinguível de
 * um bug da plataforma. Na segunda tentativa o erro concreto vai no prompt, que
 * é o que faz o modelo acertar — não é retry cego.
 *
 * Uma só: se a segunda falhar, o problema não é ruído de formatação, e insistir
 * só multiplica custo.
 */
export interface JsonAgentResult<T> {
  output: T;
  /** Consumo SOMADO das tentativas — senão o retry sairia de graça na auditoria. */
  usage: LlmResult;
}

export async function callJsonAgent<T>(
  schema: z.ZodType<T>,
  req: LlmRequest,
): Promise<JsonAgentResult<T>> {
  const first = await callLlm(req);

  try {
    return { output: parseAgentOutput(schema, first.text), usage: first };
  } catch (err) {
    if (!(err instanceof AgentOutputError)) throw err;
    if (first.truncated) {
      err.message = `${err.message} — resposta cortada no limite de tokens`;
    }

    // Cortado no limite de tokens é outro problema: o JSON está incompleto, não
    // malformado. Repetir com o mesmo teto daria o mesmo corte — dobra o espaço
    // e pede resposta mais enxuta.
    const tetoRetry = first.truncated ? req.maxTokens * 2 : req.maxTokens;
    const retry = await callLlm({
      ...req,
      maxTokens: tetoRetry,
      /*
       * A retentativa NÃO refaz a investigação. O que falhou foi o formato, não
       * o conteúdo: o modelo já buscou no repositório e já escreveu a resposta —
       * ele só precisa reemitir como JSON válido. Deixar as ferramentas ligadas
       * aqui faria ele repetir 8 buscas idênticas pra chegar na mesma conclusão,
       * pagando a investigação duas vezes.
       */
      tools: undefined,
      runTool: undefined,
      ...(first.truncated
        ? {
            system: `${req.system}\n\nA resposta anterior estourou o limite de tokens e chegou cortada. Seja mais conciso: menos itens em listas, frases mais curtas. O JSON precisa fechar.`,
          }
        : {}),
      // O texto anterior volta como material: sem ele o modelo reescreve do zero
      // e pode perder a análise boa que estava dentro do JSON quebrado.
      userText: [
        req.userText,
        '',
        '# Correção de formato',
        'Sua resposta anterior foi rejeitada pelo parser:',
        err.message,
        '',
        'Resposta anterior (entre as marcas):',
        '<<<',
        first.text,
        '>>>',
        '',
        'Reenvie o MESMO conteúdo como JSON válido e nada mais: sem markdown, sem',
        'cercas de código, sem texto antes ou depois. Quebra de linha dentro de',
        'string precisa ser \\n escapado.',
      ].join('\n'),
    });

    // Segunda falha: sobe com o consumo SOMADO das duas tentativas e com o
    // sinal de corte. É o que a linha em Run precisa pra dizer, depois, se o
    // caso foi teto de saída baixo (aumenta o teto) ou modelo devolvendo lixo
    // (mexe no prompt) — sem isso a auditoria gravava "0 tokens, desconhecido".
    try {
      const output = parseAgentOutput(schema, retry.text);
      return {
        output,
        usage: {
          ...retry,
          inputTokens: first.inputTokens + retry.inputTokens,
          outputTokens: first.outputTokens + retry.outputTokens,
          // a investigação aconteceu na PRIMEIRA tentativa; a segunda não busca
          toolRounds: first.toolRounds,
          toolTrail: first.toolTrail,
        },
      };
    } catch (erroFinal) {
      if (!(erroFinal instanceof AgentOutputError)) throw erroFinal;
      throw new AgentOutputError(
        retry.truncated
          ? `${erroFinal.message} — resposta cortada no limite de tokens (${retry.outputTokens} de ${tetoRetry})`
          : erroFinal.message,
        erroFinal.raw,
        {
          provider: retry.provider,
          model: retry.model,
          inputTokens: first.inputTokens + retry.inputTokens,
          outputTokens: first.outputTokens + retry.outputTokens,
          truncated: first.truncated || retry.truncated,
        },
      );
    }
  }
}
