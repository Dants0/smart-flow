const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Normaliza texto para comparação tolerante a acento e caixa: remove
 * diacríticos (NFD + strip de marcas combinantes), lowercase, trim.
 * "Período", "periodo" e "PERÍODO" viram todos "periodo".
 */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}
