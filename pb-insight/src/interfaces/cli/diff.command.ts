import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DiffVersionsUseCase } from "../../application/use-cases/diff-versions/diff-versions.use-case.js";
import { JsonObjectRepository } from "../../infrastructure/persistence/json-object-repository.js";
import { DEFAULT_GRAPH_PATH, DEFAULT_SNAPSHOTS_DIR, parseArgs } from "./shared.js";

// Uso:
//   npm run diff -- --list                        lista snapshots salvos (mais recente primeiro)
//   npm run diff -- --from <arquivo> [--to <arquivo>]   compara dois snapshots (--to default: grafo atual)
//   npm run diff -- --from <arquivo> --contains agm      filtra por nome do objeto
//   npm run diff -- --from <arquivo> --only modified
const { flags } = parseArgs(process.argv.slice(2));

if (flags["list"] === "true") {
  for (const { path, mtime } of listSnapshotsNewestFirst()) {
    console.log(`${mtime.toISOString()}  ${path}`);
  }
  process.exit(0);
}

const fromPath = flags["from"];
if (!fromPath) {
  console.error("Uso: npm run diff -- --from <snapshot> [--to <snapshot>] [--only added|removed|modified] [--contains texto]");
  console.error("     npm run diff -- --list   (para ver os snapshots disponíveis)");
  process.exit(1);
}
const toPath = flags["to"] ?? DEFAULT_GRAPH_PATH;

const fromObjects = await JsonObjectRepository.load(fromPath).allObjects();
const toObjects = await JsonObjectRepository.load(toPath).allObjects();

let entries = new DiffVersionsUseCase().execute(fromObjects, toObjects);

const only = flags["only"];
if (only) entries = entries.filter((e) => e.changeType === only);

const contains = flags["contains"]?.toLowerCase();
if (contains) entries = entries.filter((e) => e.name.includes(contains));

console.log(`Comparando:\n  de: ${fromPath}\n  para: ${toPath}\n`);
if (entries.length === 0) {
  console.log("Nenhuma diferença encontrada (com os filtros aplicados).");
  process.exit(0);
}

const bySymbol: Record<string, string> = { added: "+", removed: "-", modified: "~" };
for (const entry of entries) {
  console.log(`  ${bySymbol[entry.changeType]} ${entry.id.padEnd(60)} [${entry.type}]`);
}

const counts = { added: 0, removed: 0, modified: 0 };
for (const e of entries) counts[e.changeType]++;
console.log(`\n${counts.added} adicionado(s), ${counts.removed} removido(s), ${counts.modified} modificado(s).`);

function listSnapshotsNewestFirst(): Array<{ path: string; mtime: Date }> {
  let files: string[];
  try {
    files = readdirSync(DEFAULT_SNAPSHOTS_DIR);
  } catch {
    return [];
  }
  return files
    .map((f) => {
      const path = join(DEFAULT_SNAPSHOTS_DIR, f);
      return { path, mtime: statSync(path).mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}
