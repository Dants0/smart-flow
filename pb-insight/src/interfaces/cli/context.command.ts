import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { QueryObjectContextUseCase } from "../../application/use-cases/query-object-context/query-object-context.use-case.js";
import { FsSourceFileProvider } from "../../infrastructure/filesystem/fs-source-file-provider.js";
import { JsonObjectRepository } from "../../infrastructure/persistence/json-object-repository.js";
import { DEFAULT_GRAPH_PATH, DEFAULT_WS_OBJECTS_ROOT, parseArgs } from "./shared.js";

// Uso: npm run context -- <nome_do_objeto> [--hops 2] [--graph .data/graph.json]
//        [--root <ws_objects>] [--dump contexto.txt]
// --dump concatena os fontes (root + ancestrais + relacionados de 1º salto)
// num único arquivo, pronto para colar no prompt de diagnóstico.
const { positional, flags } = parseArgs(process.argv.slice(2));
const objectName = positional[0];
if (!objectName) {
  console.error("Uso: npm run context -- <nome_do_objeto> [--hops N] [--dump arquivo.txt]");
  process.exit(1);
}

const hops = Number(flags["hops"] ?? "2");
const graphPath = flags["graph"] ?? DEFAULT_GRAPH_PATH;
const rootDir = flags["root"] ?? DEFAULT_WS_OBJECTS_ROOT;

const repository = JsonObjectRepository.load(graphPath);
const context = await new QueryObjectContextUseCase(repository).execute(objectName, hops);

if (!context) {
  console.error(`Objeto "${objectName}" não encontrado no grafo (${graphPath}).`);
  process.exit(1);
}

console.log(`Objeto:     ${context.root.id} [${context.root.type}]`);
console.log(`Ancestrais: ${context.ancestors.map((a) => a.name).join(" -> ") || "(nenhum)"}`);
for (const ambiguity of context.ambiguities) {
  console.warn(`Ambíguo:    ${ambiguity}`);
}

console.log(`\nRelacionados (${context.related.length}, até ${hops} salto(s)):`);
for (const { object, via, depth } of context.related) {
  console.log(`  ${"  ".repeat(depth - 1)}${via.type.padEnd(13)} ${object.id} [${object.type}]`);
}

console.log(`\nDependentes diretos (${context.dependents.length}):`);
for (const { object, via } of context.dependents.slice(0, 30)) {
  console.log(`  ${via.type.padEnd(13)} ${object.id} [${object.type}]`);
}
if (context.dependents.length > 30) {
  console.log(`  ... e mais ${context.dependents.length - 30}`);
}

if (flags["dump"]) {
  const provider = new FsSourceFileProvider(rootDir);
  const toDump = [
    context.root,
    ...context.ancestors,
    ...context.related.filter((r) => r.depth === 1).map((r) => r.object),
  ];
  const parts: string[] = [];
  for (const obj of toDump) {
    const source = await provider.readOne(obj.filePath);
    parts.push(`--- OBJETO: ${obj.name} [${obj.type}] (${obj.filePath}) ---\n${source}`);
  }
  const dumpPath = flags["dump"];
  mkdirSync(dirname(dumpPath), { recursive: true });
  writeFileSync(dumpPath, parts.join("\n\n"), "utf-8");
  const totalKb = Math.round(parts.join("").length / 1024);
  console.log(`\nDump: ${toDump.length} objetos (${totalKb} KB) em ${dumpPath}`);
}
