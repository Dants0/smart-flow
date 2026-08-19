import type { ObjectDependency } from "../../../domain/entities/object-dependency.js";
import type { PBObject } from "../../../domain/entities/pb-object.js";
import type { IObjectRepository } from "../../ports/object-repository.port.js";

/**
 * Dado um objeto (ex.: o citado num chamado), monta o contexto de diagnóstico:
 * a cadeia completa de ancestrais + as dependências diretas expandidas em N
 * saltos. É a resposta estruturada à lacuna observada no teste-minimo: o
 * modelo errou a causa raiz por não ver w_sheet_gen / u_datawindow_padrao.
 */
export interface ObjectContext {
  root: PBObject;
  /** Cadeia de herança do mais próximo ao mais distante. */
  ancestors: PBObject[];
  /** Objetos alcançáveis em até `hops` saltos (sem o root/ancestrais), com a aresta de chegada. */
  related: Array<{ object: PBObject; via: ObjectDependency; depth: number }>;
  /** Quem depende do root (1 salto reverso) — útil para análise de impacto. */
  dependents: Array<{ object: PBObject; via: ObjectDependency }>;
  /** Nomes ambíguos entre PBLs encontrados na resolução. */
  ambiguities: string[];
}

export class QueryObjectContextUseCase {
  constructor(private readonly repository: IObjectRepository) {}

  async execute(objectName: string, hops = 2): Promise<ObjectContext | null> {
    const matches = await this.repository.findByName(objectName.toLowerCase());
    const root = matches[0];
    if (!root) return null;

    // Nomes de objeto colidem entre PBLs (ex.: d_lmc02tab existe em agenda50
    // E em atende50/repac50 — IDs distintos, "${library}/${name}"). `root` é
    // só a versão exibida como raiz; dependents/related abaixo são agregados
    // de TODOS os matches, senão quem chama a versão do 2º PBL some do
    // resultado — regressão relatada pelo usuário em 2026-07-24.
    const ambiguities: string[] = [];
    if (matches.length > 1) {
      ambiguities.push(`${objectName}: ${matches.map((m) => m.id).join(", ")}`);
    }

    const visited = new Set<string>(matches.map((m) => m.id));

    const ancestors: PBObject[] = [];
    let current = root;
    while (current.ancestor) {
      const next = (await this.repository.findByName(current.ancestor))[0];
      if (!next || visited.has(next.id)) break;
      visited.add(next.id);
      ancestors.push(next);
      current = next;
    }

    const related: ObjectContext["related"] = [];
    let frontier = [...matches, ...ancestors];
    for (let depth = 1; depth <= hops; depth++) {
      const nextFrontier: PBObject[] = [];
      for (const node of frontier) {
        for (const edge of await this.repository.dependenciesOf(node.id)) {
          if (visited.has(edge.toId)) continue;
          visited.add(edge.toId);
          const target = await this.repository.findById(edge.toId);
          if (!target) continue;
          related.push({ object: target, via: edge, depth });
          nextFrontier.push(target);
        }
      }
      frontier = nextFrontier;
    }

    const dependents: ObjectContext["dependents"] = [];
    for (const match of matches) {
      for (const edge of await this.repository.dependentsOf(match.id)) {
        const source = await this.repository.findById(edge.fromId);
        if (source) dependents.push({ object: source, via: edge });
      }
    }

    return { root, ancestors, related, dependents, ambiguities };
  }
}
