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
export interface LlmRequest {
  system: string;
  userText: string;
  images?: CardImage[];
  maxTokens: number;
}

export interface LlmResult {
  text: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** true = a resposta foi CORTADA no limite de tokens (JSON chega pela metade). */
  truncated: boolean;
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
  { system, userText, images, maxTokens }: LlmRequest,
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

  const resp = await comFalhaClassificada(() =>
    anthropic.messages.create({
      model: settings.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    }),
  );

  const text = resp.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return {
    text,
    provider: 'anthropic',
    model: settings.model,
    inputTokens: resp.usage?.input_tokens ?? 0,
    outputTokens: resp.usage?.output_tokens ?? 0,
    truncated: resp.stop_reason === 'max_tokens',
  };
}

async function callOpenAI(
  { system, userText, images, maxTokens }: LlmRequest,
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
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
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
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('OpenAI não retornou conteúdo na resposta');
  }

  return {
    text,
    provider: 'openai',
    model: settings.openaiModel,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
    truncated: json.choices?.[0]?.finish_reason === 'length',
  };
}
