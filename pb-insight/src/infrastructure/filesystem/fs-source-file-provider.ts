import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  ISourceFileProvider,
  SourceFile,
} from "../../application/ports/source-file-provider.port.js";
import { EXTENSION_TO_TYPE } from "../../domain/value-objects/pb-object-type.js";

/**
 * Varre recursivamente uma raiz (ex.: o ws_objects do smart_desktop) e lê os
 * arquivos-fonte PB. Leitura pura de filesystem — nenhuma interação com git.
 *
 * Encoding: lê como UTF-8. Fontes em ANSI/cp1252 terão acentos trocados em
 * comentários/strings, mas identificadores PB são ASCII, então o grafo não é
 * afetado (limitação documentada em docs/).
 */
export class FsSourceFileProvider implements ISourceFileProvider {
  constructor(private readonly rootDir: string) {}

  async readAll(): Promise<SourceFile[]> {
    const files: SourceFile[] = [];
    for (const absolutePath of walk(this.rootDir)) {
      files.push({
        relativePath: relative(this.rootDir, absolutePath).replace(/\\/g, "/"),
        content: readFileSync(absolutePath, "utf-8"),
      });
    }
    return files;
  }

  async readOne(relativePath: string): Promise<string> {
    return readFileSync(join(this.rootDir, relativePath), "utf-8");
  }
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      yield* walk(full);
    } else if (isPBSource(entry.name)) {
      yield full;
    }
  }
}

function isPBSource(fileName: string): boolean {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return ext in EXTENSION_TO_TYPE;
}
