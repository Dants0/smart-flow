import Anthropic from '@anthropic-ai/sdk';
import type { CardImage } from '../domain/card';
import { getSettings, type PlatformSettings } from './settingsRepository';

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
}

export async function callLlm(req: LlmRequest): Promise<LlmResult> {
  const settings = await getSettings();
  return settings.aiProvider === 'openai' ? callOpenAI(req, settings) : callAnthropic(req, settings);
}

async function callAnthropic(
  { system, userText, images, maxTokens }: LlmRequest,
  settings: PlatformSettings,
): Promise<LlmResult> {
  if (!settings.anthropicApiKey) {
    throw new Error('Chave da Anthropic não configurada — veja Configurações > IA.');
  }
  const anthropic = new Anthropic({ apiKey: settings.anthropicApiKey });

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
    choices?: { message?: { content?: string } }[];
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
  };
}
