import { createHash } from "node:crypto";

/** Utilitários compartilhados de leitura do formato de export do PowerBuilder. */

export function stripBom(source: string): string {
  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

/** Nome declarado no cabeçalho `$PBExportHeader$nome.srw`. */
export function exportHeaderName(source: string): string | null {
  const m = source.match(/^\$PBExportHeader\$(\S+?)\.\w+\s*$/m);
  return m ? m[1]!.toLowerCase() : null;
}

/** Declaração `global type <nome> from <ancestral>`. */
export function globalTypeDeclaration(source: string): { name: string; ancestor: string } | null {
  const m = source.match(/^global\s+type\s+(\w+)\s+from\s+(\w+)/im);
  return m ? { name: m[1]!.toLowerCase(), ancestor: m[2]!.toLowerCase() } : null;
}

/** Controles embutidos: `type <nome> from <tipo> within <pai>`. */
export function embeddedControls(source: string): Array<{ name: string; fromType: string }> {
  const out: Array<{ name: string; fromType: string }> = [];
  const re = /^type\s+(\w+)\s+from\s+(\w+)\s+within\s+\w+/gim;
  for (const m of source.matchAll(re)) {
    out.push({ name: m[1]!.toLowerCase(), fromType: m[2]!.toLowerCase() });
  }
  return out;
}

/** Referências `dataobject = "d_x"` (janela/uo → datawindow object). */
export function dataObjectRefs(source: string): string[] {
  const refs = new Set<string>();
  for (const m of source.matchAll(/dataobject\s*=\s*"(\w+)"/gi)) {
    refs.add(m[1]!.toLowerCase());
  }
  return [...refs];
}

/**
 * Desfaz os escapes de string do PowerBuilder: ~" ~t ~r ~n ~~.
 */
export function unescapePBString(value: string): string {
  return value
    .replace(/~"/g, '"')
    .replace(/~r~n/g, "\n")
    .replace(/~n/g, "\n")
    .replace(/~r/g, "\n")
    .replace(/~t/g, "\t")
    .replace(/~~/g, "~");
}

/**
 * Strings visíveis ao usuário: valores de text="..." e title="...".
 * Alimenta o SearchIndex (liga "campo Período" → objeto real).
 */
export function uiStrings(source: string): string[] {
  const found = new Set<string>();
  const re = /\b(?:text|title)\s*=\s*"((?:~"|[^"])+)"/gi;
  for (const m of source.matchAll(re)) {
    const value = unescapePBString(m[1]!).trim();
    // descarta ruído: strings vazias, "none", placeholders de 1 char
    if (value.length >= 2 && value.toLowerCase() !== "none") found.add(value);
  }
  return [...found];
}

/** PBL de origem derivada do caminho relativo (diretório do arquivo). */
export function libraryFromPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const dir = normalized.slice(0, normalized.lastIndexOf("/"));
  return dir.replace(/\.pbl\.src$/i, "");
}

export function objectId(library: string, name: string): string {
  return `${library}/${name}`;
}
