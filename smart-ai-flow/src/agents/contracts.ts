import { z } from 'zod';

/**
 * Contratos de saída dos subagents.
 *
 * Cada estágio de IA tem um schema fechado. Isso é o que separa
 * "plataforma" de "chat no terminal": a saída não é texto livre,
 * é um objeto que o card renderiza e o dev revisa por partes.
 *
 * Estratégia de parsing: pedimos ao modelo que responda SÓ com JSON
 * no formato do schema (via system prompt) e validamos aqui com Zod.
 * Se falhar a validação, o orquestrador manda o card pra ERRO.
 */

// ---- Estágio ANÁLISE ---------------------------------------------------

export const AffectedObjectSchema = z.object({
  name: z.string(), // ex: 'w_smartweb_resultado'
  type: z.string(), // ex: 'window', 'datawindow', 'nvo', 'stored procedure'
  reason: z.string(), // por que este objeto é relevante
});

export const AnalyzerOutputSchema = z.object({
  rootCause: z.string(), // hipótese de causa raiz, em uma frase
  reasoning: z.array(z.string()), // passos do raciocínio (o "pensamento" que a UI mostra)
  affectedObjects: z.array(AffectedObjectSchema),
  needsTrace: z.boolean(), // true = análise pede um pbtrace antes de propor
  confidence: z.enum(['baixa', 'media', 'alta']),
});
export type AnalyzerOutput = z.infer<typeof AnalyzerOutputSchema>;

// ---- Estágio DESENVOLVIMENTO ------------------------------------------

export const ProposerOutputSchema = z.object({
  summary: z.string(), // o que a mudança faz, em uma frase
  diff: z.string(), // diff unificado que o dev vai aplicar manualmente no PB
  rationale: z.string(), // por que essa é a correção certa
  risks: z.array(z.string()), // efeitos colaterais possíveis (Oracle vs SQL Server, etc)
  testHint: z.string(), // como reproduzir/validar o cenário original
});
export type ProposerOutput = z.infer<typeof ProposerOutputSchema>;

/**
 * Falha de contrato: o modelo respondeu, mas não no formato combinado.
 * Carrega a resposta crua e o consumo — sem isso a linha em Run registrava
 * "0 tokens, modelo desconhecido" e não sobrava evidência nenhuma pra investigar.
 */
export class AgentOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = 'AgentOutputError';
  }
}

/**
 * Recorta o objeto JSON de dentro da resposta.
 *
 * O modelo às vezes embrulha em ```json, às vezes escreve uma frase antes ("Segue
 * a análise:") ou depois. Remover cercas com replace global era frágil: uma crase
 * dentro de uma string do próprio JSON (comum quando o texto cita código) mutilava
 * o conteúdo. Aqui a varredura respeita string e escape, e para no fecha-chaves
 * que equilibra o abre.
 */
export function extractJson(raw: string): string {
  const start = raw.indexOf('{');
  if (start < 0) return raw.trim();

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return raw.slice(start, i + 1);
  }

  // não fechou: devolve o que veio pra a mensagem de erro poder mostrar
  return raw.slice(start);
}

/**
 * Escapa quebra de linha e outros controles CRUS dentro de string JSON.
 *
 * É a falha real que derrubou cards em produção ("Unterminated string in JSON at
 * position 2818"): JSON não permite `\n` literal dentro de string, e o modelo
 * escreve assim toda vez que cola trecho de código ou mensagem de erro de várias
 * linhas. O conteúdo está correto — só a serialização não é válida —, então
 * consertar aqui é mais barato (e menos irritante pro dev) do que jogar o card
 * em ERRO e queimar outra análise inteira.
 */
export function repairJsonStrings(json: string): string {
  const ESCAPES: Record<string, string> = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };
  let out = '';
  let inString = false;
  let escaped = false;

  for (const ch of json) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }

    if (inString && ESCAPES[ch]) {
      out += ESCAPES[ch];
      continue;
    }
    // outros caracteres de controle (ex: \b vindo de log) também são inválidos
    if (inString && ch < ' ') {
      out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0');
      continue;
    }

    out += ch;
  }

  return out;
}

/**
 * Faz o parse seguro da resposta do modelo contra um schema, com um passo de
 * reparo antes de desistir. Quem chama decide o que fazer com a falha — os
 * agentes tentam uma segunda vez com o erro no prompt (ver jsonCall.ts).
 */
export function parseAgentOutput<T>(schema: z.ZodType<T>, raw: string): T {
  if (!raw.trim()) {
    throw new AgentOutputError('o modelo respondeu vazio (nenhum texto na resposta)', raw);
  }

  const candidate = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (first) {
    try {
      parsed = JSON.parse(repairJsonStrings(candidate));
    } catch {
      const detail = first instanceof Error ? first.message : 'JSON inválido';
      throw new AgentOutputError(`resposta não é JSON válido (${detail})`, raw);
    }
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || 'raiz'}: ${i.message}`)
      .join('; ');
    throw new AgentOutputError(`JSON fora do contrato (${issues})`, raw);
  }
  return result.data;
}
