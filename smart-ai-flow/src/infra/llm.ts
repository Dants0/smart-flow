import Anthropic from '@anthropic-ai/sdk';
import type { CardImage } from '../domain/card';

/**
 * Camada única por onde ANALISE e DESENVOLVIMENTO falam com o LLM.
 * Suporta Anthropic (padrão) ou OpenAI via AI_PROVIDER — útil pra testar
 * sem chave da Anthropic válida. Igual ao resto do backend: token vive só
 * aqui, no server, nunca na máquina do dev.
 */
const PROVIDER = (process.env.AI_PROVIDER ?? 'anthropic').toLowerCase();

const ANTHROPIC_MODEL = process.env.MODEL ?? 'claude-sonnet-5';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const MODEL = PROVIDER === 'openai' ? OPENAI_MODEL : ANTHROPIC_MODEL;

export interface LlmRequest {
  system: string;
  userText: string;
  images?: CardImage[];
  maxTokens: number;
}

export async function callLlm(req: LlmRequest): Promise<string> {
  return PROVIDER === 'openai' ? callOpenAI(req) : callAnthropic(req);
}

async function callAnthropic({ system, userText, images, maxTokens }: LlmRequest): Promise<string> {
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
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content }],
  });

  return resp.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

async function callOpenAI({ system, userText, images, maxTokens }: LlmRequest): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurado no .env do backend');
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
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
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

  const json = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('OpenAI não retornou conteúdo na resposta');
  }
  return text;
}
