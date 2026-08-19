import type { ObjectDiffEntry } from "../entities/object-diff.js";
import type { PBObject } from "../entities/pb-object.js";

/**
 * Compara dois conjuntos de PBObject (dois snapshots/versões) por
 * content_hash. Regra pura, sem I/O — os snapshots já vêm carregados.
 *
 * Objetos são comparados por `id` (library/name), não por conteúdo: um
 * objeto que só mudou de PBL aparece como removed + added (é de fato uma
 * mudança estrutural, não uma edição no lugar).
 */
export function diffObjectSnapshots(from: PBObject[], to: PBObject[]): ObjectDiffEntry[] {
  const fromById = new Map(from.map((o) => [o.id, o]));
  const toById = new Map(to.map((o) => [o.id, o]));
  const entries: ObjectDiffEntry[] = [];

  for (const obj of to) {
    const prior = fromById.get(obj.id);
    if (!prior) {
      entries.push({ id: obj.id, name: obj.name, type: obj.type, changeType: "added", toHash: obj.contentHash });
    } else if (prior.contentHash !== obj.contentHash) {
      entries.push({
        id: obj.id,
        name: obj.name,
        type: obj.type,
        changeType: "modified",
        fromHash: prior.contentHash,
        toHash: obj.contentHash,
      });
    }
  }

  for (const obj of from) {
    if (!toById.has(obj.id)) {
      entries.push({ id: obj.id, name: obj.name, type: obj.type, changeType: "removed", fromHash: obj.contentHash });
    }
  }

  return entries.sort((a, b) => a.id.localeCompare(b.id));
}
