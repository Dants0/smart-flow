import Anthropic from '@anthropic-ai/sdk';
import type { ClientOptions } from '@anthropic-ai/sdk';
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
 * O campo não usado vai **explicitamente `null`**, e essa é a linha que mais
 * importa aqui: o SDK preenche `apiKey` com `process.env.ANTHROPIC_API_KEY` e
 * `authToken` com `ANTHROPIC_AUTH_TOKEN` quando você omite, e a chave de API
 * vence o token na hora de montar o header. Uma variável esquecida no ambiente
 * do container sequestraria silenciosamente a credencial escolhida na tela.
 */
export function anthropicClientOptions(
  authType: AnthropicAuthType,
  credential: string,
): ClientOptions {
  if (authType === 'oauth') {
    return {
      apiKey: null,
      authToken: credential,
      defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
    };
  }
  return { apiKey: credential, authToken: null };
}

/** O que dizer quando não há credencial — a mensagem muda com o tipo escolhido. */
function credencialFaltando(authType: AnthropicAuthType): string {
  return authType === 'oauth'
    ? 'Token OAuth da Anthropic não configurado — cole o CLAUDE_CODE_OAUTH_TOKEN em Configurações > IA.'
    : 'Chave da Anthropic não configurada — veja Configurações > IA.';
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

  const resp = await anthropic.messages.create({
    model: settings.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content }],
  });

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
    throw new Error(`OpenAI respondeu ${resp.status}: ${await resp.text()}`);
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
