import { SearchUseCase } from "../../application/use-cases/search/search.use-case.js";
import { PB_OBJECT_TYPES, type PBObjectType } from "../../domain/value-objects/pb-object-type.js";
import { InMemorySearchIndex } from "../../infrastructure/search/in-memory-search-index.js";
import { JsonObjectRepository } from "../../infrastructure/persistence/json-object-repository.js";
import { DEFAULT_GRAPH_PATH, parseArgs } from "./shared.js";

// Uso: npm run search -- "palavra-chave" [--limit 20] [--types Window,DataWindow] [--graph .data/graph.json]
//
// Busca tanto em texto visível na tela ("Período" -> d_lmc02tab, SPEC §12)
// quanto dentro de corpos de evento/função (nome de variável, mensagem de
// erro, método citado) — liga uma palavra do CHAMADO ao objeto+evento onde
// ela aparece, sem o usuário já saber qual objeto procurar.
const { positional, flags } = parseArgs(process.argv.slice(2));
const query = positional.join(" ");
if (!query) {
  console.error('Uso: npm run search -- "palavra-chave" [--limit N]');
  process.exit(1);
}

const graphPath = flags["graph"] ?? DEFAULT_GRAPH_PATH;
const limit = Number(flags["limit"] ?? "20");

let types: PBObjectType[] | undefined;
if (flags["types"]) {
  const requested = flags["types"].split(",").map((t) => t.trim());
  const invalid = requested.filter((t) => !PB_OBJECT_TYPES.includes(t as PBObjectType));
  if (invalid.length > 0) {
    console.error(`Tipo(s) inválido(s): ${invalid.join(", ")}. Use um de: ${PB_OBJECT_TYPES.join(", ")}.`);
    process.exit(1);
  }
  types = requested as PBObjectType[];
}

const repository = JsonObjectRepository.load(graphPath);
const index = new InMemorySearchIndex(await repository.allObjects());
const matches = new SearchUseCase(index).execute(query, limit, types);

if (matches.length === 0) {
  console.log(`Nenhuma ocorrência encontrada para "${query}".`);
  process.exit(0);
}

console.log(`${matches.length} ocorrência(s) para "${query}":\n`);
for (const match of matches) {
  if (match.kind === "ui_string") {
    console.log(`  [texto]  "${match.matchedText}"`.padEnd(70) + `  ${match.object.id} [${match.object.type}]`);
  } else {
    console.log(
      `  [código] ${match.event!.owner}.${match.event!.name} (linhas ${match.event!.startLine}-${match.event!.endLine})  ${match.object.id}\n           "${match.matchedText}"`,
    );
  }
}
