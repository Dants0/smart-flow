import type { CodebaseVersion } from "../../../domain/entities/codebase-version.js";
import type { PBObject } from "../../../domain/entities/pb-object.js";
import type { ParseError } from "../../ports/pb-object-parser.port.js";
import type { IDependencyExtractor } from "../../ports/dependency-extractor.port.js";
import type { IObjectRepository } from "../../ports/object-repository.port.js";
import type { ISourceFileProvider } from "../../ports/source-file-provider.port.js";
import type { ParserRegistry } from "../../../infrastructure/parsers/parser-registry.js";
import { sha256 } from "../../../infrastructure/parsers/powerscript-source.js";

export interface IngestReport {
  version: CodebaseVersion;
  parsedCount: number;
  dependencyCount: number;
  skipped: ParseError[];
  durationMs: number;
}

export class IngestCodebaseVersionUseCase {
  constructor(
    private readonly files: ISourceFileProvider,
    private readonly parsers: ParserRegistry,
    private readonly extractor: IDependencyExtractor,
    private readonly repository: IObjectRepository,
  ) {}

  async execute(versionLabel: string): Promise<IngestReport> {
    const startedAt = Date.now();

    const sources = await this.files.readAll();
    const objects: PBObject[] = [];
    const rawSourceById = new Map<string, string>();
    const skipped: ParseError[] = [];

    for (const file of sources) {
      const parser = this.parsers.parserFor(file.relativePath);
      if (!parser) continue;

      const result = parser.parse(file.content, file.relativePath);
      if (result.ok) {
        objects.push(result.value);
        rawSourceById.set(result.value.id, file.content);
      } else {
        skipped.push(result.error);
      }
    }

    const dependencies = this.extractor.extract(objects, rawSourceById);

    const version: CodebaseVersion = {
      id: crypto.randomUUID(),
      label: versionLabel,
      ingestedAt: new Date().toISOString(),
      sourceHash: sha256(objects.map((o) => o.contentHash).sort().join("")),
      objectCount: objects.length,
    };

    await this.repository.saveSnapshot(version, objects, dependencies);

    return {
      version,
      parsedCount: objects.length,
      dependencyCount: dependencies.length,
      skipped,
      durationMs: Date.now() - startedAt,
    };
  }
}
