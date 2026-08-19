import Anthropic from '@anthropic-ai/sdk';

/**
 * Cliente único da API. O token da EMPRESA vive aqui, no backend —
 * nunca na máquina do dev. É isso que torna o consumo auditável e
 * controlável em custo (todo run passa por este ponto).
 */
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // token corporativo, injetado no ambiente do backend
});

// Ajustável por env. Sonnet é um bom equilíbrio custo/qualidade pra triagem;
// suba pra um modelo mais forte se a proposta de diff exigir.
export const MODEL = process.env.MODEL ?? 'claude-sonnet-5';
