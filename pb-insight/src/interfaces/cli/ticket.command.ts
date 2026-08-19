import { existsSync, readFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { AddTicketUseCase } from "../../application/use-cases/tickets/add-ticket.use-case.js";
import { FindSimilarTicketsUseCase } from "../../application/use-cases/tickets/find-similar-tickets.use-case.js";
import { LinkTicketToObjectUseCase } from "../../application/use-cases/tickets/link-ticket.use-case.js";
import { OpenAIEmbeddingProvider } from "../../infrastructure/embeddings/openai-embedding-provider.js";
import { JsonObjectRepository } from "../../infrastructure/persistence/json-object-repository.js";
import { JsonTicketRepository } from "../../infrastructure/persistence/json-ticket-repository.js";
import { DEFAULT_GRAPH_PATH, DEFAULT_TICKETS_PATH, DEFAULT_WS_OBJECTS_ROOT, parseArgs } from "./shared.js";

// Uso — base de conhecimento de tickets (SPEC §13.5/§13.6), cadastro 100%
// manual (sem scraping/integração automática — decisão do projeto):
//
//   npm run ticket -- add --external SMART-51120 --title "..." \
//     --description descricao.txt --resolution resolucao.txt \
//     [--module X] [--version-affected 26.2.03A] [--resolved-at 2026-01-10]
//
//   npm run ticket -- link --ticket SMART-51120 --object w_confirm_agm \
//     [--event zoom --owner dw_agm18tab] [--notes "..."]
//
//   npm run ticket -- list
//
//   npm run ticket -- similar "texto do novo chamado" [--limit 5]
//   npm run ticket -- similar --text chamado.txt [--limit 5]
//
// `add` e `similar` calculam embedding via OpenAI (text-embedding-3-small,
// custo desprezível) — requer OPENAI_API_KEY. `link`/`list` não chamam
// nenhuma API.
loadEnv();
if (!process.env["OPENAI_API_KEY"] && existsSync("../teste-minimo/.env")) {
  loadEnv({ path: "../teste-minimo/.env" });
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const subcommand = positional[0];
const ticketsPath = flags["tickets"] ?? DEFAULT_TICKETS_PATH;
const graphPath = flags["graph"] ?? DEFAULT_GRAPH_PATH;

function usageAndExit(): never {
  console.error(
    [
      "Uso:",
      '  npm run ticket -- add --external <id> --title "..." --description <arq> --resolution <arq> [--module X] [--version-affected Y] [--resolved-at YYYY-MM-DD]',
      "  npm run ticket -- link --ticket <id|externalId> --object <nome> [--event <nome> --owner <controle>] [--notes \"...\"]",
      "  npm run ticket -- list",
      '  npm run ticket -- similar "texto" | --text <arq> [--limit N]',
    ].join("\n"),
  );
  process.exit(1);
}

function readFileArg(flag: string): string {
  const path = flags[flag];
  if (!path) usageAndExit();
  try {
    return readFileSync(path, "utf-8");
  } catch {
    console.error(`Não foi possível ler ${path}`);
    process.exit(1);
  }
}

const ticketRepo = JsonTicketRepository.load(ticketsPath);

switch (subcommand) {
  case "add": {
    const externalId = flags["external"];
    const title = flags["title"];
    if (!externalId || !title || !flags["description"] || !flags["resolution"]) usageAndExit();

    if (!process.env["OPENAI_API_KEY"]) {
      console.error("OPENAI_API_KEY não definida (nem em .env local nem em ../teste-minimo/.env) — necessária para o embedding.");
      process.exit(1);
    }

    const useCase = new AddTicketUseCase(ticketRepo, new OpenAIEmbeddingProvider());
    try {
      const ticket = await useCase.execute({
        externalId,
        title,
        descriptionRaw: readFileArg("description"),
        resolutionText: readFileArg("resolution"),
        module: flags["module"] ?? null,
        versionAffected: flags["version-affected"] ?? null,
        resolvedAt: flags["resolved-at"] ?? new Date().toISOString(),
      });
      console.log(`Ticket cadastrado: ${ticket.externalId} (id: ${ticket.id})`);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
    break;
  }

  case "link": {
    const ticketRef = flags["ticket"];
    const objectName = flags["object"];
    if (!ticketRef || !objectName) usageAndExit();

    const eventFocus =
      flags["event"] && flags["owner"] ? { owner: flags["owner"], name: flags["event"] } : undefined;
    if (flags["event"] && !flags["owner"]) {
      console.error("--event requer --owner (o controle dono do evento).");
      process.exit(1);
    }

    const objectRepo = JsonObjectRepository.load(graphPath);
    const useCase = new LinkTicketToObjectUseCase(ticketRepo, objectRepo);
    try {
      const { link, ambiguities } = await useCase.execute({
        ticketRef,
        objectName,
        event: eventFocus,
        notes: flags["notes"] ?? null,
      });
      console.log(`Link criado: ticket ${ticketRef} -> ${link.objectId}${link.event ? ` (${link.event.owner}.${link.event.name})` : ""}`);
      for (const a of ambiguities) console.log(`Aviso — nome ambíguo entre PBLs: ${a}`);
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
    break;
  }

  case "list": {
    const tickets = await ticketRepo.allTickets();
    if (tickets.length === 0) {
      console.log("Nenhum ticket cadastrado ainda.");
      break;
    }
    for (const t of tickets) {
      const links = await ticketRepo.linksForTicket(t.id);
      const linkSummary = links.length
        ? links.map((l) => l.objectId + (l.event ? `:${l.event.owner}.${l.event.name}` : "")).join(", ")
        : "(sem link)";
      console.log(`${t.externalId.padEnd(16)} ${t.title.slice(0, 60).padEnd(62)} -> ${linkSummary}`);
    }
    console.log(`\n${tickets.length} ticket(s) cadastrado(s).`);
    break;
  }

  case "similar": {
    const queryText = flags["text"] ? readFileArg("text") : positional[1];
    if (!queryText) usageAndExit();
    if (!process.env["OPENAI_API_KEY"]) {
      console.error("OPENAI_API_KEY não definida — necessária para o embedding da busca.");
      process.exit(1);
    }
    const limit = Number(flags["limit"] ?? "5");
    const useCase = new FindSimilarTicketsUseCase(ticketRepo, new OpenAIEmbeddingProvider());
    const results = await useCase.execute(queryText, limit);
    if (results.length === 0) {
      console.log("Nenhum ticket cadastrado ainda para comparar.");
      break;
    }
    for (const r of results) {
      console.log(`\n[${r.score.toFixed(3)}] ${r.ticket.externalId} — ${r.ticket.title}`);
      for (const l of r.links) {
        console.log(`    -> ${l.objectId}${l.event ? ` (${l.event.owner}.${l.event.name})` : ""}`);
      }
    }
    break;
  }

  default:
    usageAndExit();
}
