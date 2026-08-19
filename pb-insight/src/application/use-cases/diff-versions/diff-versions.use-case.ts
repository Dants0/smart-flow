import type { ObjectDiffEntry } from "../../../domain/entities/object-diff.js";
import type { PBObject } from "../../../domain/entities/pb-object.js";
import { diffObjectSnapshots } from "../../../domain/services/diff-object-snapshots.js";

/**
 * Casca fina sobre a regra pura de domínio — existe para manter o mesmo
 * padrão de orquestração dos demais use cases e dar um ponto de extensão
 * (ex.: filtrar por objetos alcançáveis a partir de uma raiz) sem alterar
 * a regra de diff em si.
 */
export class DiffVersionsUseCase {
  execute(from: PBObject[], to: PBObject[]): ObjectDiffEntry[] {
    return diffObjectSnapshots(from, to);
  }
}
