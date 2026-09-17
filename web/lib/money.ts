/**
 * Custo em dólar com duas casas, TRUNCADO (14.8913 -> 14.89) — nunca
 * arredondado pra cima: é estimativa, e mostrar centavo que não foi gasto
 * contradiz a fatura do provedor.
 *
 * O `1e-9` compensa o ponto flutuante: 14.29 * 100 dá 1428.9999…, e o floor
 * puro mostraria 14.28.
 */
export function formatUsd(value: number): string {
  const truncated = Math.floor(value * 100 + 1e-9) / 100;
  return `$${truncated.toFixed(2)}`;
}
