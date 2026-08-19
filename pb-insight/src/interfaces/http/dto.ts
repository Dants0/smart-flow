import type { PBObject } from "../../domain/entities/pb-object.js";

/**
 * Versão enxuta de PBObject para respostas de lista (busca, contexto) —
 * sem `structured` (que pode conter dezenas de eventos/colunas e infla a
 * resposta). O detalhe completo mora em GET /objects/:name.
 */
export interface ObjectSummaryDTO {
  id: string;
  type: string;
  name: string;
  library: string;
  filePath: string;
  ancestor: string | null;
}

export function objectSummary(obj: PBObject): ObjectSummaryDTO {
  return {
    id: obj.id,
    type: obj.type,
    name: obj.name,
    library: obj.library,
    filePath: obj.filePath,
    ancestor: obj.ancestor,
  };
}

export const objectSummarySchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    type: { type: "string" },
    name: { type: "string" },
    library: { type: "string" },
    filePath: { type: "string" },
    ancestor: { type: "string", nullable: true },
  },
} as const;
