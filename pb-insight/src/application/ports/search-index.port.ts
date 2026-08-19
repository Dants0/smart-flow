import type { PBObject } from "../../domain/entities/pb-object.js";
import type { PBObjectType } from "../../domain/value-objects/pb-object-type.js";

export type SearchMatchKind = "ui_string" | "event";

export interface SearchMatch {
  kind: SearchMatchKind;
  object: PBObject;
  /** ui_string: o texto visível encontrado. event: um trecho do corpo ao redor do match. */
  matchedText: string;
  /** Presente só quando kind === "event". */
  event?: { owner: string; name: string; startLine: number; endLine: number };
}

/**
 * Busca substring tolerante a acento/caixa sobre duas superfícies:
 * - texto visível ao usuário (labels, headers, títulos) — liga "campo Período"
 *   ao objeto real (`d_lmc02tab`), ver SPEC §6/§12;
 * - corpos de evento/função — liga uma palavra-chave do CHAMADO (nome de
 *   variável, mensagem de erro, nome de método citado) ao objeto+evento onde
 *   ela aparece no código, sem o usuário precisar já saber qual objeto
 *   procurar.
 */
export interface ISearchIndex {
  /** `types` filtra por PBObjectType antes de aplicar `limit` — sem isso, filtrar depois do corte perderia matches. */
  search(query: string, limit?: number, types?: PBObjectType[]): SearchMatch[];
}
