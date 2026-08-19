import type { IDependencyExtractor } from "../../application/ports/dependency-extractor.port.js";
import type { ObjectDependency } from "../../domain/entities/object-dependency.js";
import type { PBObject } from "../../domain/entities/pb-object.js";

/**
 * Extrai as arestas do grafo por heurística textual, validando cada candidato
 * contra o índice de objetos conhecidos — só nomes que existem de fato no
 * snapshot viram aresta, o que elimina falsos positivos de tipos built-in
 * (commandbutton, datawindow, ...) e de identificadores locais.
 *
 * Arestas produzidas:
 *   inherits      global type X from Y            (Y é objeto conhecido)
 *   embeds        type ctl from u_x within X      (u_x é objeto conhecido)
 *   references    dataobject="d_x"                (d_x é DataWindow conhecida)
 *   opens         Open()/OpenSheet()/OpenWithParm (alvo é Window conhecida)
 *   function_call identificador( no corpo         (nome é Function conhecida)
 */
export class HeuristicDependencyExtractor implements IDependencyExtractor {
  extract(objects: PBObject[], rawSourceById: ReadonlyMap<string, string>): ObjectDependency[] {
    const byName = indexByName(objects);
    const edges: ObjectDependency[] = [];
    const seen = new Set<string>();

    const addEdge = (dep: ObjectDependency) => {
      const key = `${dep.fromId}|${dep.toId}|${dep.type}`;
      if (dep.fromId !== dep.toId && !seen.has(key)) {
        seen.add(key);
        edges.push(dep);
      }
    };

    // Resolve nome → objeto, preferindo a mesma PBL em caso de colisão.
    const resolve = (name: string, fromLibrary: string): PBObject | null => {
      const candidates = byName.get(name);
      if (!candidates || candidates.length === 0) return null;
      return candidates.find((c) => c.library === fromLibrary) ?? candidates[0]!;
    };

    for (const obj of objects) {
      if (obj.ancestor) {
        const target = resolve(obj.ancestor, obj.library);
        if (target) addEdge({ fromId: obj.id, toId: target.id, type: "inherits" });
      }

      for (const control of obj.structured.controls ?? []) {
        const target = resolve(control.fromType, obj.library);
        if (target) addEdge({ fromId: obj.id, toId: target.id, type: "embeds" });
      }

      for (const dataObject of obj.structured.dataObjects ?? []) {
        const target = resolve(dataObject, obj.library);
        if (target?.type === "DataWindow") {
          addEdge({ fromId: obj.id, toId: target.id, type: "references" });
        }
      }

      const source = rawSourceById.get(obj.id);
      if (!source) continue;

      for (const opened of openTargets(source)) {
        const target = resolve(opened, obj.library);
        if (target?.type === "Window") {
          addEdge({ fromId: obj.id, toId: target.id, type: "opens" });
        }
      }

      for (const called of calledIdentifiers(source)) {
        const target = resolve(called, obj.library);
        if (target?.type === "Function") {
          addEdge({ fromId: obj.id, toId: target.id, type: "function_call" });
        }
      }
    }

    return edges;
  }
}

function indexByName(objects: PBObject[]): Map<string, PBObject[]> {
  const index = new Map<string, PBObject[]>();
  for (const obj of objects) {
    const list = index.get(obj.name);
    if (list) list.push(obj);
    else index.set(obj.name, [obj]);
  }
  return index;
}

/** Alvos de Open/OpenSheet/OpenWithParm/OpenSheetWithParm (primeiro argumento). */
function openTargets(source: string): Set<string> {
  const targets = new Set<string>();
  for (const m of source.matchAll(/\bopen(?:sheet|withparm|sheetwithparm)?\s*\(\s*(\w+)/gi)) {
    targets.add(m[1]!.toLowerCase());
  }
  return targets;
}

/** Todo identificador seguido de "(" — a validação contra o índice filtra o resto. */
function calledIdentifiers(source: string): Set<string> {
  const called = new Set<string>();
  for (const m of source.matchAll(/\b([a-z_]\w{2,})\s*\(/gi)) {
    called.add(m[1]!.toLowerCase());
  }
  return called;
}
