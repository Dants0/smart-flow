import Anthropic from '@anthropic-ai/sdk';
import type { ClientOptions } from '@anthropic-ai/sdk';
import {
  RECUSA_OAUTH,
  TransientLlmError,
  ehRecusaDisfarcadaDe429,
  esperaSugerida,
  headersDeCota,
  resumoDeCota,
  statusEhTransitorio,
} from './llmErrors';
import type { CardImage } from '../domain/card';
import {
  getSettings,
  type AnthropicAuthType,
  type PlatformSettings,
} from './settingsRepository';

/**
 * Camada única por onde ANALISE e DESENVOLVIMENTO falam com o LLM.
 * Suporta Anthropic (padrão) ou OpenAI, escolhido pela tela de Configurações
 * (aiProvider) — lido a cada chamada, nunca cacheado, pra uma troca de chave
 * ou provider valer na hora, sem restart.
 *
 * Devolve também o consumo de tokens: é o que o orquestrador grava na tabela
 * Run pra auditoria de custo (a razão declarada de o token viver só aqui).
 */
/**
 * Ferramenta que o modelo pode chamar durante a própria resposta. O schema é
 * JSON Schema puro, que é o que os dois providers aceitam — a OpenAI só pede um
 * envelope diferente em volta (ver `callOpenAI`).
 */
export interface LlmTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmRequest {
  system: string;
  userText: string;
  images?: CardImage[];
  maxTokens: number;
  /**
   * Ferramentas de investigação. Com elas a chamada deixa de ser um tiro só e
   * vira um LAÇO: o modelo pede uma busca, lê o resultado e decide a próxima —
   * em vez de receber um contexto que alguém montou antes de ele pensar. É a
   * diferença entre a esteira e um dev com terminal aberto (ver codeTools.ts).
   */
  tools?: LlmTool[];
  /** Executor das ferramentas. Sem ele, `tools` é ignorado. */
  runTool?: (name: string, input: unknown) => Promise<string>;
  /** Teto de rodadas. Passado o teto, o modelo responde com o que já levantou. */
  maxToolRounds?: number;
}

export interface LlmResult {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** true = a resposta foi CORTADA no limite de tokens (JSON chega pela metade). */
  truncated: boolean;
  /** Rodadas de ferramenta gastas investigando. 0 = respondeu sem buscar nada. */
  toolRounds?: number;
  /** O que ele buscou, na ordem — trilha de auditoria pro dev e pro card. */
  toolTrail?: string[];
}

/**
 * Teto de rodadas de ferramenta. Cada rodada é uma ida à API levando o histórico
 * inteiro, então o custo cresce com o quadrado da conversa; 12 cobre a cadeia de
 * chamada mais funda do SMART (evento → função de janela → NVO → função global)
 * com folga pra errar duas buscas no caminho.
 */
const MAX_TOOL_ROUNDS = 12;

/**
 * Recado que encerra a investigação. Vai anexado ao último lote de resultados —
 * é o que substitui o `tool_choice: 'none'` que o SDK 0.32 ainda não tem.
 */
const AVISO_FIM_DE_BUSCA =
  'Limite de buscas atingido. Não chame mais ferramentas: responda AGORA com o ' +
  'JSON final, usando o que você já levantou. Se alguma coisa ficou sem ' +
  'confirmar, diga isso no próprio JSON em vez de buscar de novo.';

/** Resumo de uma chamada de ferramenta, pra trilha de auditoria. */
function resumirChamada(name: string, input: unknown): string {
  const args = (input ?? {}) as Record<string, unknown>;
  const alvo = args.texto ?? args.caminho ?? args.nome ?? '';
  const faixa = typeof args.de === 'number' ? ` (linha ${args.de})` : '';
  return `${name}: ${String(alvo).slice(0, 80)}${faixa}`;
}

export async function callLlm(req: LlmRequest): Promise<LlmResult> {
  const settings = await getSettings();
  return settings.aiProvider === 'openai' ? callOpenAI(req, settings) : callAnthropic(req, settings);
}

/**
 * Monta as opções do cliente conforme o tipo de credencial. Pura de propósito:
 * é a regra que decide em qual header o segredo viaja, e errar isso dá 401 sem
 * nenhuma pista de qual dos dois caminhos foi tomado.
 *
 * - **chave de API** (`sk-ant-api...`): header `x-api-key`, é o `apiKey` do SDK.
 * - **token OAuth** (`CLAUDE_CODE_OAUTH_TOKEN`, o que a conta corporativa
 *   emite): header `Authorization: Bearer`, é o `authToken` do SDK. O
 *   `/v1/messages` só aceita esse caminho com o beta `oauth-2025-04-20` junto —
 *   sem ele a requisição é recusada.
 *
 * `maxRetries` sobe de 2 (default do SDK) pra 3, e é só isso que ele cobre:
 * retentativas de segundos, pro soluço curto. Limite de uso de verdade — a
 * janela da assinatura — passa batido aqui e é tratado pela fila, que sabe
 * esperar minutos (ver `llmErrors.ts` e `jobQueue.ts`).
 *
 * O campo não usado vai **explicitamente `null`**, e essa é a linha que mais
 * importa aqui: o SDK preenche `apiKey` com `process.env.ANTHROPIC_API_KEY` e
 * `authToken` com `ANTHROPIC_AUTH_TOKEN` quando você omite, e a chave de API
 * vence o token na hora de montar o header. Uma variável esquecida no ambiente
 * do container sequestraria silenciosamente a credencial escolhida na tela.
 */
/** Retentativas dentro do próprio SDK — segundos, não minutos (ver comentário acima). */
const MAX_RETRIES = 3;

export function anthropicClientOptions(
  authType: AnthropicAuthType,
  credential: string,
): ClientOptions {
  if (authType === 'oauth') {
    return {
      apiKey: null,
      authToken: credential,
      defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
      maxRetries: MAX_RETRIES,
    };
  }
  return { apiKey: credential, authToken: null, maxRetries: MAX_RETRIES };
}

/** O que dizer quando não há credencial — a mensagem muda com o tipo escolhido. */
function credencialFaltando(authType: AnthropicAuthType): string {
  return authType === 'oauth'
    ? 'Token OAuth da Anthropic não configurado — cole o CLAUDE_CODE_OAUTH_TOKEN em Configurações > IA.'
    : 'Chave da Anthropic não configurada — veja Configurações > IA.';
}

/**
 * Traduz a falha do SDK da Anthropic em `TransientLlmError` quando ela é do
 * tipo que passa sozinha, preservando o que a resposta disse sobre a cota.
 *
 * Sem isto, o 429 chegava ao orquestrador como um `Error` qualquer com o corpo
 * cru (`429 {"type":"error",...,"message":"Error"}`) — que é literalmente tudo
 * o que dava pra saber, porque a Anthropic não detalha a mensagem nesse caso e
 * os headers, que detalham, eram descartados aqui.
 */
async function comFalhaClassificada<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof Anthropic.APIError)) throw err;
    if (!statusEhTransitorio(err.status)) throw err;

    const cota = headersDeCota(err.headers);

    // 429 sem um único header de cota não é limite de uso: é recusa de permissão
    // com a roupa errada. Esperar não resolve, então vai pra ERRO na hora — com
    // a mensagem dizendo o que trocar, que é o que falta pro dev agir.
    if (ehRecusaDisfarcadaDe429(err.status, cota)) {
      throw new Error(`${RECUSA_OAUTH} (resposta crua: ${err.message})`);
    }

    throw new TransientLlmError(`${err.message}${resumoDeCota(cota)}`, {
      status: err.status,
      retryAfterMs: esperaSugerida(cota),
      limits: cota,
    });
  }
}

async function callAnthropic(
  { system, userText, images, maxTokens, tools, runTool, maxToolRounds }: LlmRequest,
  settings: PlatformSettings,
): Promise<LlmResult> {
  if (!settings.anthropicCredential) {
    throw new Error(credencialFaltando(settings.anthropicAuthType));
  }
  const anthropic = new Anthropic(
    anthropicClientOptions(settings.anthropicAuthType, settings.anthropicCredential),
  );

  const content: Anthropic.MessageParam['content'] = [
    ...(images ?? []).map(
      (img): Anthropic.ImageBlockParam => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: img.data,
        },
      }),
    ),
    { type: 'text', text: userText },
  ];

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content }];
  const usarFerramentas = Boolean(tools?.length && runTool);
  const tetoRodadas = maxToolRounds ?? MAX_TOOL_ROUNDS;

  /*
   * Consumo SOMADO de todas as rodadas. Sem isso o card registraria só a última
   * ida à API, e uma investigação de 8 buscas apareceria na auditoria de custo
   * como se tivesse sido uma pergunta simples.
   */
  let inputTokens = 0;
  let outputTokens = 0;
  let rodadas = 0;
  const trilha: string[] = [];

  for (;;) {
    // Depois do teto o modelo responde sem ferramenta: é isso que garante que
    // sempre sai um JSON, mesmo que a investigação não tenha fechado.
    const aindaPodeBuscar = usarFerramentas && rodadas < tetoRodadas;

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: settings.model,
      max_tokens: maxTokens,
      system,
      messages,
    };

    /*
     * As ferramentas continuam declaradas mesmo depois do teto. Removê-las
     * deixaria o histórico com blocos `tool_use` que a requisição não declara
     * mais — inconsistência que a API recusa. Quem encerra a investigação é o
     * recado anexado ao último `tool_result` (ver mais abaixo), e não
     * `tool_choice: 'none'`, que só existe a partir do SDK 0.39.
     */
    if (usarFerramentas) params.tools = tools as unknown as Anthropic.Tool[];

    const resp = await comFalhaClassificada(() => anthropic.messages.create(params));

    inputTokens += resp.usage?.input_tokens ?? 0;
    outputTokens += resp.usage?.output_tokens ?? 0;

    const pedidos = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (pedidos.length === 0 || !aindaPodeBuscar || !runTool) {
      const text = resp.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('\n');

      return {
        text,
        provider: 'anthropic',
        model: settings.model,
        inputTokens,
        outputTokens,
        truncated: resp.stop_reason === 'max_tokens',
        toolRounds: rodadas,
        toolTrail: trilha,
      };
    }

    messages.push({
      role: 'assistant',
      content: resp.content as unknown as Anthropic.MessageParam['content'],
    });

    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const pedido of pedidos) {
      trilha.push(resumirChamada(pedido.name, pedido.input));
      let saida: string;
      try {
        saida = await runTool(pedido.name, pedido.input);
      } catch (err) {
        // Falha de ferramenta vira TEXTO pro modelo, nunca exceção: ele sabe
        // tentar outra busca, e derrubar o card por um grep que falhou joga
        // fora toda a investigação já feita.
        saida = `A ferramenta falhou: ${err instanceof Error ? err.message : String(err)}`;
      }
      resultados.push({ type: 'tool_result', tool_use_id: pedido.id, content: saida });
    }

    /*
     * O recado de encerramento viaja JUNTO do último lote de resultados, como
     * mais um bloco da mesma mensagem. Mandar numa mensagem separada quebraria a
     * alternância user/assistant que a API exige.
     */
    const conteudo: Anthropic.MessageParam['content'] = [...resultados];
    if (rodadas + 1 >= tetoRodadas) {
      conteudo.push({ type: 'text', text: AVISO_FIM_DE_BUSCA });
    }

    messages.push({ role: 'user', content: conteudo });
    rodadas++;
  }
}

/** Uma chamada de ferramenta como a OpenAI devolve. */
interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAiMessage {
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
}

async function callOpenAI(
  { system, userText, images, maxTokens, tools, runTool, maxToolRounds }: LlmRequest,
  settings: PlatformSettings,
): Promise<LlmResult> {
  if (!settings.openaiApiKey) {
    throw new Error('Chave da OpenAI não configurada — veja Configurações > IA.');
  }

  const content = [
    { type: 'text', text: userText },
    ...(images ?? []).map((img) => ({
      type: 'image_url' as const,
      image_url: { url: `data:${img.mediaType};base64,${img.data}` },
    })),
  ];

  const messages: unknown[] = [
    { role: 'system', content: system },
    { role: 'user', content },
  ];

  const usarFerramentas = Boolean(tools?.length && runTool);
  const tetoRodadas = maxToolRounds ?? MAX_TOOL_ROUNDS;
  /* Envelope da OpenAI em volta do mesmo JSON Schema que a Anthropic come cru. */
  const ferramentas = (tools ?? []).map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  let inputTokens = 0;
  let outputTokens = 0;
  let rodadas = 0;
  const trilha: string[] = [];

  for (;;) {
    const aindaPodeBuscar = usarFerramentas && rodadas < tetoRodadas;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.openaiApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.openaiModel,
        max_tokens: maxTokens,
        // Modo JSON nativo: elimina cerca de markdown e frase de abertura, que eram
        // metade das falhas de parse. O system prompt já pede 'objeto JSON', que é
        // o que a OpenAI exige pra aceitar este formato.
        //
        // Durante as rodadas de ferramenta ele fica DESLIGADO: a resposta que
        // pede uma busca não é JSON do contrato, e exigir o formato ali faz o
        // modelo preferir responder qualquer coisa a investigar.
        ...(aindaPodeBuscar ? {} : { response_format: { type: 'json_object' } }),
        // Mesma regra do caminho Anthropic: as ferramentas seguem declaradas
        // depois do teto, desligadas por `tool_choice`, pra não deixar o
        // histórico com `tool_calls` que a requisição não declara mais.
        ...(usarFerramentas
          ? { tools: ferramentas, ...(aindaPodeBuscar ? {} : { tool_choice: 'none' }) }
          : {}),
        messages,
      }),
    });

    if (!resp.ok) {
      // Mesma regra do caminho Anthropic: 429/5xx é espera, não exceção do card.
      const corpo = await resp.text();
      if (statusEhTransitorio(resp.status)) {
        const cota = { 'retry-after': resp.headers.get('retry-after') ?? '' };
        throw new TransientLlmError(`OpenAI respondeu ${resp.status}: ${corpo}`, {
          status: resp.status,
          retryAfterMs: esperaSugerida(cota),
        });
      }
      throw new Error(`OpenAI respondeu ${resp.status}: ${corpo}`);
    }

    const json = (await resp.json()) as {
      choices?: { message?: OpenAiMessage; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    inputTokens += json.usage?.prompt_tokens ?? 0;
    outputTokens += json.usage?.completion_tokens ?? 0;

    const message = json.choices?.[0]?.message;
    const pedidos = message?.tool_calls ?? [];

    if (pedidos.length === 0 || !aindaPodeBuscar || !runTool) {
      const text = message?.content;
      if (!text) {
        throw new Error('OpenAI não retornou conteúdo na resposta');
      }
      return {
        text,
        provider: 'openai',
        model: settings.openaiModel,
        inputTokens,
        outputTokens,
        truncated: json.choices?.[0]?.finish_reason === 'length',
        toolRounds: rodadas,
        toolTrail: trilha,
      };
    }

    messages.push(message);

    for (const pedido of pedidos) {
      let args: unknown = {};
      try {
        args = JSON.parse(pedido.function.arguments || '{}');
      } catch {
        // argumento malformado não derruba a rodada: vira erro legível pro modelo
        args = {};
      }
      trilha.push(resumirChamada(pedido.function.name, args));

      let saida: string;
      try {
        saida = await runTool(pedido.function.name, args);
      } catch (err) {
        saida = `A ferramenta falhou: ${err instanceof Error ? err.message : String(err)}`;
      }
      messages.push({ role: 'tool', tool_call_id: pedido.id, content: saida });
    }

    rodadas++;
  }
}
