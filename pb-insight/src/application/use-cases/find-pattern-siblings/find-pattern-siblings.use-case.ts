import type { EmbeddedControl, PBEventBlock, PBObject } from "../../../domain/entities/pb-object.js";
import type { IObjectRepository } from "../../ports/object-repository.port.js";

/**
 * Uma ocorrência do MESMO evento, no MESMO tipo de controle, em outro objeto.
 * Ex.: `dw_pac01tab.avancar` em w_sismama_mamografia é irmã da ocorrência em
 * w_siscolo_citopatologico — as duas janelas não têm aresta entre si, só
 * compartilham o ancestral u_dw_pac.
 */
export interface PatternSibling {
  object: PBObject;
  control: EmbeddedControl;
  event: PBEventBlock;
}

export interface PatternSiblingsResult {
  /** Tipo do controle no objeto raiz (ex.: "u_dw_pac"). */
  controlType: string;
  /** `controlType` + todos os que herdam dele (ex.: "u_dw_pac_assist"). */
  controlTypes: string[];
  /** Ocorrências em outros objetos, ordenadas por id. Nunca inclui o raiz. */
  siblings: PatternSibling[];
}

/**
 * Encontra as outras ocorrências do evento sob diagnóstico no restante do
 * ws_objects.
 *
 * Existe porque o contexto do DiagnoseTicketUseCase é ancorado num único
 * objeto (raiz + ancestrais + 1 salto de embeds/references), e janelas que
 * só compartilham o ancestral do controle NÃO têm aresta entre si — logo
 * nunca entravam no dump. Resultado prático (chamado SMART-50927): o
 * diagnóstico apontou 1 janela quando 6 tinham o mesmo defeito, porque o
 * modelo só recebeu 1. Um `grep` no repositório inteiro achava as 6; o grafo
 * também acha, e sem reler fonte — `structured.controls` e
 * `structured.events` já estão no snapshot.
 *
 * A busca é sobre o TIPO do controle (e seus descendentes por herança), não
 * sobre o nome: `dw_pac01tab` é convenção, `dw_pac01` e `dw_pac01ff` são a
 * mesma coisa em outras janelas.
 */
export class FindPatternSiblingsUseCase {
  constructor(private readonly repository: IObjectRepository) {}

  async execute(root: PBObject, controlName: string, eventName: string): Promise<PatternSiblingsResult | null> {
    const control = (root.structured.controls ?? []).find((c) => c.name === controlName.toLowerCase());
    if (!control) return null;

    const controlTypes = await this.typeAndDescendants(control.fromType);
    const name = eventName.toLowerCase();

    const siblings: PatternSibling[] = [];
    for (const obj of await this.repository.allObjects()) {
      if (obj.id === root.id) continue;
      // O fonte exportado declara cada controle duas vezes (forward declaration
      // no topo + bloco real), então `controls` traz duplicatas — sem dedupe
      // cada janela irmã apareceria duas vezes e comeria o dobro do teto.
      const seen = new Set<string>();
      for (const c of obj.structured.controls ?? []) {
        if (!controlTypes.has(c.fromType) || seen.has(c.name)) continue;
        seen.add(c.name);
        const event = (obj.structured.events ?? []).find((e) => e.owner === c.name && e.name === name);
        if (event) siblings.push({ object: obj, control: c, event });
      }
    }

    // Mesma PBL primeiro: quem corta pelo teto tem que cortar o menos
    // relevante, e "mesma biblioteca" é o proxy mais direto de "mesmo módulo,
    // mesma família de telas". Ordenar só por id joga o módulo do chamado
    // para o fim ou para fora da lista, dependendo da letra inicial da PBL.
    siblings.sort((a, b) => {
      const sameA = a.object.library === root.library ? 0 : 1;
      const sameB = b.object.library === root.library ? 0 : 1;
      return sameA - sameB || a.object.id.localeCompare(b.object.id);
    });

    return { controlType: control.fromType, controlTypes: [...controlTypes].sort(), siblings };
  }

  /**
   * O tipo do controle mais todos os que herdam dele, transitivamente. Sem
   * isso, um `u_dw_pac_assist` que sobrescreve o mesmo evento ficaria de fora
   * do relatório de abrangência mesmo tendo exatamente o mesmo defeito.
   */
  private async typeAndDescendants(rootType: string): Promise<Set<string>> {
    const types = new Set<string>([rootType]);
    const queue = await this.repository.findByName(rootType);
    const visited = new Set(queue.map((o) => o.id));

    while (queue.length > 0) {
      const node = queue.shift()!;
      for (const edge of await this.repository.dependentsOf(node.id)) {
        if (edge.type !== "inherits" || visited.has(edge.fromId)) continue;
        visited.add(edge.fromId);
        const child = await this.repository.findById(edge.fromId);
        if (!child) continue;
        types.add(child.name);
        queue.push(child);
      }
    }
    return types;
  }
}
