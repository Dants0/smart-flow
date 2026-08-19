import { FindEventUseCase } from "../../application/use-cases/find-event/find-event.use-case.js";
import { JsonObjectRepository } from "../../infrastructure/persistence/json-object-repository.js";
import { DEFAULT_GRAPH_PATH, parseArgs } from "./shared.js";

// Uso: npm run event -- <objeto> <evento> [--owner <controle>] [--graph .data/graph.json]
//
// Navegação direta a um evento/função específico, sem abrir o PowerBuilder
// nem procurar manualmente num .srw de centenas de KB. Ex.:
//   npm run event -- w_confirm_agm zoom --owner dw_agm18tab
const { positional, flags } = parseArgs(process.argv.slice(2));
const [objectName, eventName] = positional;
if (!objectName || !eventName) {
  console.error("Uso: npm run event -- <objeto> <evento> [--owner <controle>] [--graph .data/graph.json]");
  process.exit(1);
}

const graphPath = flags["graph"] ?? DEFAULT_GRAPH_PATH;
const repository = JsonObjectRepository.load(graphPath);
const matches = await new FindEventUseCase(repository).execute(objectName, eventName, flags["owner"]);

if (matches.length === 0) {
  const ownerNote = flags["owner"] ? ` (controle ${flags["owner"]})` : "";
  console.log(`Nenhum evento/função "${eventName}" encontrado em "${objectName}"${ownerNote}.`);
  process.exit(0);
}

for (const m of matches) {
  console.log(
    `\n=== ${m.objectId} :: ${m.event.owner}.${m.event.name} [${m.event.kind}] (linhas ${m.event.startLine}-${m.event.endLine}, ${m.event.body.length} chars) ===\n`,
  );
  console.log(m.event.body);
}

if (matches.length > 1) {
  console.log(`\n(${matches.length} ocorrências — use --owner <controle> para filtrar a um controle específico)`);
}
