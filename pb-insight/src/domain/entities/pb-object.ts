import type { PBObjectType } from "../value-objects/pb-object-type.js";

/**
 * Um objeto PowerBuilder parseado a partir do fonte exportado (.srw, .srd, ...).
 *
 * `id` é `${library}/${name}` — nomes de objeto podem colidir entre PBLs
 * diferentes, então o nome sozinho não identifica unicamente.
 * `rawContent` NÃO é persistido no snapshot (o fonte continua no working
 * directory do ws_objects); guardamos `filePath` + `contentHash` e relemos
 * do disco quando o texto completo é necessário.
 */
export interface PBObject {
  id: string;
  type: PBObjectType;
  name: string;
  /** Nome do ancestral declarado em `global type <name> from <ancestor>`. */
  ancestor: string | null;
  /** PBL de origem, derivada do caminho (ex: "agenda50/ag_conf"). */
  library: string;
  filePath: string;
  contentHash: string;
  structured: PBStructuredContent;
}

/** Conteúdo estruturado extraído por tipo de objeto (campos opcionais por tipo). */
export interface PBStructuredContent {
  /** Windows/UserObjects: controles embutidos (`type X from Y within Z`). */
  controls?: EmbeddedControl[];
  /** Windows/UserObjects: dataobjects referenciados (`dataobject="d_x"`). */
  dataObjects?: string[];
  /** Functions: assinatura da declaração global. */
  signature?: string;
  /** DataWindows: colunas com code tables quando presentes. */
  columns?: DataWindowColumn[];
  /** DataWindows: SQL do retrieve (com escapes ~" já resolvidos). */
  retrieveSql?: string;
  /** Strings visíveis ao usuário (labels, headers, títulos) — alimenta o SearchIndex. */
  uiStrings?: string[];
  /** Windows/UserObjects/Functions: eventos e funções extraídos individualmente. */
  events?: PBEventBlock[];
}

/**
 * Um evento ou função individual dentro de um objeto — a unidade de
 * granularidade que fecha a lacuna identificada em docs/03: a causa raiz de
 * um bug costuma estar contida num único evento de ~100-300 linhas, não no
 * objeto inteiro (que pode ter dezenas de eventos e centenas de KB).
 */
export interface PBEventBlock {
  kind: "event" | "function" | "subroutine";
  /** Controle dono (nome do próprio objeto quando é evento/função da janela/UO em si). */
  owner: string;
  name: string;
  body: string;
  /** Linhas 1-indexadas no arquivo fonte original, para navegação/exibição. */
  startLine: number;
  endLine: number;
}

export interface EmbeddedControl {
  name: string;
  fromType: string;
}

export interface DataWindowColumn {
  name: string;
  dbName?: string;
  /** Pares exibição/valor da code table, quando a coluna tem valores estáticos. */
  codeTable?: Array<{ display: string; data: string }>;
}
