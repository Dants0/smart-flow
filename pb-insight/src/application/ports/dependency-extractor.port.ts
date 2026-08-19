import type { ObjectDependency } from "../../domain/entities/object-dependency.js";
import type { PBObject } from "../../domain/entities/pb-object.js";

/**
 * Extrai as arestas do grafo. Recebe também o fonte bruto por objeto porque
 * arestas de chamada de função exigem varrer o corpo dos eventos, e o
 * rawContent não vive dentro de PBObject (decisão: fonte fica no disco).
 */
export interface IDependencyExtractor {
  extract(objects: PBObject[], rawSourceById: ReadonlyMap<string, string>): ObjectDependency[];
}
