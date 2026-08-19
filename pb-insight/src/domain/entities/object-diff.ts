import type { PBObjectType } from "../value-objects/pb-object-type.js";

export type ObjectChangeType = "added" | "removed" | "modified";

/**
 * Diferença de um objeto entre dois snapshots. Não inclui "unchanged" — o
 * diff só reporta o que mudou, que é o que interessa numa análise de
 * regressão pós-pull.
 */
export interface ObjectDiffEntry {
  id: string;
  name: string;
  type: PBObjectType;
  changeType: ObjectChangeType;
  fromHash?: string;
  toHash?: string;
}
