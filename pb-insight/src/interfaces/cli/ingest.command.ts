// PRIMEIRO import: em ESM os módulos são avaliados na ordem em que aparecem,
// e o shared.js lê PB_INSIGHT_WS_ROOT no topo. Um `loadEnv()` no corpo do
// arquivo rodaria tarde demais — o shared já teria resolvido o caminho.
import "dotenv/config";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { IngestCodebaseVersionUseCase } from "../../application/use-cases/ingest-codebase-version/ingest-codebase-version.use-case.js";
import { FsSourceFileProvider } from "../../infrastructure/filesystem/fs-source-file-provider.js";
import { HeuristicDependencyExtractor } from "../../infrastructure/parsers/heuristic-dependency-extractor.js";
import { ParserRegistry } from "../../infrastructure/parsers/parser-registry.js";
import { JsonObjectRepository } from "../../infrastructure/persistence/json-object-repository.js";
import {
  DEFAULT_GRAPH_PATH,
  DEFAULT_SNAPSHOTS_DIR,
  DEFAULT_WS_OBJECTS_ROOT,
  parseArgs,
  snapshotFileName,
} from "./shared.js";

// Uso: npm run ingest -- [raiz-do-ws_objects] [--label 26.2.03] [--out .data/graph.json]
//        [--no-snapshot]  (não guarda cópia histórica em .data/snapshots)
//        [--report .data/last-ingest-report.json]  (grava o relatório em JSON,
//          usado pelo IngestJobManager da API HTTP para ler o resultado de um
//          processo filho sem parsear stdout)
const { positional, flags } = parseArgs(process.argv.slice(2));
const rootDir = positional[0] ?? DEFAULT_WS_OBJECTS_ROOT;
const label = flags["label"] ?? new Date().toISOString();
const outPath = flags["out"] ?? DEFAULT_GRAPH_PATH;

const useCase = new IngestCodebaseVersionUseCase(
  new FsSourceFileProvider(rootDir),
  new ParserRegistry(),
  new HeuristicDependencyExtractor(),
  new JsonObjectRepository(outPath),
);

const report = await useCase.execute(label);

console.log(`Versão:        ${report.version.label} (${report.version.id})`);
console.log(`Objetos:       ${report.parsedCount}`);
console.log(`Dependências:  ${report.dependencyCount}`);
console.log(`Ignorados:     ${report.skipped.length}`);
console.log(`Duração:       ${(report.durationMs / 1000).toFixed(1)}s`);
console.log(`Grafo salvo em ${outPath}`);
for (const skip of report.skipped.slice(0, 10)) {
  console.warn(`  ! ${skip.filePath}: ${skip.reason}`);
}

// Cada ingestão fica também guardada em .data/snapshots — é o que permite
// `npm run diff` comparar "antes do pull" com "depois do pull" mais tarde.
if (flags["no-snapshot"] !== "true") {
  mkdirSync(DEFAULT_SNAPSHOTS_DIR, { recursive: true });
  const snapshotPath = join(DEFAULT_SNAPSHOTS_DIR, snapshotFileName(report.version.label, report.version.id));
  copyFileSync(outPath, snapshotPath);
  console.log(`Snapshot histórico: ${snapshotPath}`);
}

if (flags["report"]) {
  const reportPath = flags["report"];
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(
    reportPath,
    JSON.stringify({
      label: report.version.label,
      versionId: report.version.id,
      objectCount: report.parsedCount,
      dependencyCount: report.dependencyCount,
      skippedCount: report.skipped.length,
      durationMs: report.durationMs,
    }),
    "utf-8",
  );
}
