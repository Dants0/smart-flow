import type { ISearchIndex, SearchMatch } from "../../application/ports/search-index.port.js";
import type { PBEventBlock } from "../../domain/entities/pb-object.js";
import type { PBObject } from "../../domain/entities/pb-object.js";
import { normalizeText } from "../../domain/value-objects/normalize-text.js";
import type { PBObjectType } from "../../domain/value-objects/pb-object-type.js";

interface UIStringEntry {
  normalized: string;
  original: string;
  object: PBObject;
}

interface EventEntry {
  normalized: string;
  body: string;
  object: PBObject;
  event: PBEventBlock;
}

const SNIPPET_CONTEXT_CHARS = 60;

/**
 * Índice construído em memória a partir do snapshot completo. Para o volume
 * atual (~16k objetos, ~80 eventos por janela grande) uma varredura linear
 * por substring é da ordem de milissegundos — não há necessidade de um
 * índice invertido de tokens antes que isso vire gargalo real.
 *
 * Nota sobre `normalizeText` e posição de snippet: a normalização (NFD +
 * remoção de marcas combinantes) preserva o comprimento da string para texto
 * majoritariamente ASCII — o caso comum de corpos de evento PowerScript.
 * Comentários/strings com acentos incomuns podem, em teoria, deslocar o
 * snippet em poucos caracteres; aceitável para uma ferramenta heurística de
 * navegação, não uma garantia de exatidão byte-a-byte.
 */
export class InMemorySearchIndex implements ISearchIndex {
  private readonly uiEntries: UIStringEntry[] = [];
  private readonly eventEntries: EventEntry[] = [];

  constructor(objects: PBObject[]) {
    for (const object of objects) {
      for (const original of object.structured.uiStrings ?? []) {
        this.uiEntries.push({ normalized: normalizeText(original), original, object });
      }
      for (const event of object.structured.events ?? []) {
        this.eventEntries.push({ normalized: normalizeText(event.body), body: event.body, object, event });
      }
    }
  }

  search(query: string, limit = 20, types?: PBObjectType[]): SearchMatch[] {
    const needle = normalizeText(query);
    if (!needle) return [];

    const typeFilter = types && types.length > 0 ? new Set(types) : null;
    const matches: SearchMatch[] = [];

    for (const entry of this.uiEntries) {
      if (typeFilter && !typeFilter.has(entry.object.type)) continue;
      if (entry.normalized.includes(needle)) {
        matches.push({ kind: "ui_string", object: entry.object, matchedText: entry.original });
      }
    }

    for (const entry of this.eventEntries) {
      if (typeFilter && !typeFilter.has(entry.object.type)) continue;
      const index = entry.normalized.indexOf(needle);
      if (index >= 0) {
        matches.push({
          kind: "event",
          object: entry.object,
          matchedText: snippetAround(entry.body, index, needle.length),
          event: {
            owner: entry.event.owner,
            name: entry.event.name,
            startLine: entry.event.startLine,
            endLine: entry.event.endLine,
          },
        });
      }
    }

    // ui_string primeiro (tende a ser mais preciso — texto que o usuário
    // realmente vê), depois por tamanho do texto casado (mais curto = mais específico).
    matches.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "ui_string" ? -1 : 1;
      return a.matchedText.length - b.matchedText.length;
    });
    return matches.slice(0, limit);
  }
}

function snippetAround(body: string, index: number, needleLength: number): string {
  const start = Math.max(0, index - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(body.length, index + needleLength + SNIPPET_CONTEXT_CHARS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";
  return prefix + body.slice(start, end).replace(/\s+/g, " ").trim() + suffix;
}
