export type DependencyType =
  | "inherits"
  | "embeds"
  | "references"
  | "function_call"
  | "opens";

/**
 * Aresta dirigida do grafo: `fromId` depende de `toId`.
 * Ex.: w_confirm_agm --inherits--> w_sheet_gen
 *      w_confirm_agm --references--> d_agm18tab_conf (via dataobject=)
 */
export interface ObjectDependency {
  fromId: string;
  toId: string;
  type: DependencyType;
}
