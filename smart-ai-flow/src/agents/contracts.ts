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

/** Faz o parse seguro da resposta do modelo contra um schema. */
export function parseAgentOutput<T>(schema: z.ZodType<T>, raw: string): T {
  // remove cercas ```json que o modelo às vezes adiciona
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const json = JSON.parse(cleaned);
  return schema.parse(json);
}
