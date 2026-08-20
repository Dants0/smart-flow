/**
 * Preço por 1M de tokens (USD), por modelo. Usado só pra estimar o custo
 * registrado em Run — a fonte da verdade de cobrança é a fatura do provedor.
 * Modelo desconhecido cai no fallback e registra custo 0, nunca quebra o run.
 */
interface Price {
  input: number;
  output: number;
}

const PRICES: Record<string, Price> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

function priceFor(model: string): Price | null {
  if (PRICES[model]) return PRICES[model];
  // tolera sufixos de data/versão (ex: claude-haiku-4-5-20251001)
  const prefix = Object.keys(PRICES).find((k) => model.startsWith(k));
  return prefix ? PRICES[prefix]! : null;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceFor(model);
  if (!price) return 0;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
