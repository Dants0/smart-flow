import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import { config as loadEnv } from "dotenv";
import type { DiagnosticImage } from "../../application/ports/llm-client.port.js";
import type { DependencyType } from "../../domain/entities/object-dependency.js";
import {
  DEFAULT_DUMP_RELATION_TYPES,
  DiagnoseTicketUseCase,
} from "../../application/use-cases/diagnose-ticket/diagnose-ticket.use-case.js";
import type { ImageMediaType } from "../../domain/value-objects/image-media-type.js";
import { FsSourceFileProvider } from "../../infrastructure/filesystem/fs-source-file-provider.js";
import {
  createLLMClient,
  DEFAULT_LLM_PROVIDER,
  isValidLLMProvider,
  LLM_PROVIDERS,
} from "../../infrastructure/llm/llm-client-factory.js";
import { JsonObjectRepository } from "../../infrastructure/persistence/json-object-repository.js";
import { DEFAULT_GRAPH_PATH, DEFAULT_WS_OBJECTS_ROOT, parseArgs } from "./shared.js";

// Uso: npm run diagnose -- <objeto> --ticket ticket.txt [--hops 1]
//        [--relations embeds,references|none|all] [--dry-run] [--out diagnostico.txt]
//        [--event <nome> --owner <controle>] [--provider claude|openai] [--model <id>]
//        [--graph .data/graph.json] [--root <ws_objects>]
//        [--images screenshot1.png,screenshot2.png]
//        [--tech-lead comentario.txt]
//
// Por padrão o contexto enviado ao modelo é o objeto + ancestrais +
// embeds/references de 1 salto (ver DEFAULT_DUMP_RELATION_TYPES no use case
// para o porquê). Use --relations opens,function_call ou --relations all
// para incluir mais, --relations none para excluir tudo, ou --dry-run para
// ver o tamanho do contexto sem gastar tokens.
//
// --event/--owner troca o dump do objeto raiz INTEIRO por só o evento/função
// isolado (ver docs/03: a causa raiz costuma caber num único evento; dumpar
// o objeto todo é ruído). Ex.:
//   npm run diagnose -- w_confirm_agm --ticket t.txt --event zoom --owner dw_agm18tab --relations none
//
// --provider escolhe o LLM: "claude" (default, claude-sonnet-5 — NÃO o
// modelo mais caro) ou "openai" (gpt-4o-mini). --model sobrescreve o modelo
// default do provedor escolhido. O provedor/modelo usado é sempre impresso
// ANTES de gastar um token, mesmo sem --dry-run.
loadEnv(); // pb-insight/.env, se existir
if (!process.env["ANTHROPIC_API_KEY"] && existsSync("../teste-minimo/.env")) {
  // Reaproveita a chave já configurada no experimento teste-minimo, sem duplicá-la.
  loadEnv({ path: "../teste-minimo/.env" });
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const objectName = positional[0];
const ticketPath = flags["ticket"];
if (!objectName || !ticketPath) {
  console.error(
    "Uso: npm run diagnose -- <objeto> --ticket <arquivo.txt> [--hops N] [--relations a,b|all|none] [--provider claude|openai] [--model <id>] [--dry-run] [--out arquivo.txt]",
  );
  process.exit(1);
}

let ticketText: string;
try {
  ticketText = readFileSync(ticketPath, "utf-8");
} catch {
  console.error(`Não foi possível ler ${ticketPath}`);
  process.exit(1);
}

const hops = Number(flags["hops"] ?? "1");
const graphPath = flags["graph"] ?? DEFAULT_GRAPH_PATH;
const rootDir = flags["root"] ?? DEFAULT_WS_OBJECTS_ROOT;
const ALL_RELATION_TYPES: DependencyType[] = ["inherits", "embeds", "references", "opens", "function_call"];
const relationTypes: DependencyType[] =
  flags["relations"] === "all"
    ? ALL_RELATION_TYPES
    : flags["relations"] === "none"
      ? []
      : flags["relations"]
        ? (flags["relations"].split(",") as DependencyType[])
        : DEFAULT_DUMP_RELATION_TYPES;

const eventFocus =
  flags["event"] && flags["owner"] ? { owner: flags["owner"], name: flags["event"] } : undefined;
if (flags["event"] && !flags["owner"]) {
  console.error("--event requer --owner (o controle dono do evento — use `npm run event` para descobrir).");
  process.exit(1);
}

const providerFlag = flags["provider"];
if (providerFlag && !isValidLLMProvider(providerFlag)) {
  console.error(`--provider inválido: "${providerFlag}". Use um de: ${LLM_PROVIDERS.join(", ")}.`);
  process.exit(1);
}
const provider = providerFlag && isValidLLMProvider(providerFlag) ? providerFlag : DEFAULT_LLM_PROVIDER;
const modelOverride = flags["model"];

const requiredEnvVar = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
if (!process.env[requiredEnvVar] && flags["dry-run"] !== "true") {
  console.error(`${requiredEnvVar} não definida (nem em .env local nem em ../teste-minimo/.env).`);
  process.exit(1);
}

const EXTENSION_TO_MEDIA_TYPE: Record<string, ImageMediaType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

let images: DiagnosticImage[] | undefined;
if (flags["images"]) {
  images = flags["images"].split(",").map((path) => {
    const mediaType = EXTENSION_TO_MEDIA_TYPE[extname(path).toLowerCase()];
    if (!mediaType) {
      console.error(`Extensão de imagem não suportada em "${path}". Use png, jpg/jpeg, gif ou webp.`);
      process.exit(1);
    }
    let base64Data: string;
    try {
      base64Data = readFileSync(path).toString("base64");
    } catch {
      console.error(`Não foi possível ler ${path}`);
      process.exit(1);
    }
    return { mediaType, base64Data };
  });
}

let techLeadComment: string | undefined;
if (flags["tech-lead"]) {
  try {
    techLeadComment = readFileSync(flags["tech-lead"], "utf-8");
  } catch {
    console.error(`Não foi possível ler ${flags["tech-lead"]}`);
    process.exit(1);
  }
}

const repository = JsonObjectRepository.load(graphPath);
const sourceFiles = new FsSourceFileProvider(rootDir);
const llm = createLLMClient(provider, modelOverride);
const useCase = new DiagnoseTicketUseCase(repository, sourceFiles, llm);

let preparation;
try {
  preparation = await useCase.prepare(objectName, hops, relationTypes, eventFocus);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
if (!preparation) {
  console.error(`Objeto "${objectName}" não encontrado no grafo (${graphPath}).`);
  process.exit(1);
}

const totalChars = preparation.objectContext.length;
console.log(`Objeto:      ${preparation.context.root.id}${preparation.focusedOnEvent ? ` (evento: ${eventFocus!.owner}.${eventFocus!.name})` : ""}`);
console.log(
  `Ancestrais:  ${preparation.context.ancestors.map((a) => a.name).join(" -> ") || "(nenhum)"}`,
);
console.log(
  `Contexto:    ${preparation.dumpedObjects.length} objeto(s), ${Math.round(totalChars / 1024)} KB, ~${Math.round(
    totalChars / 4,
  )} tokens estimados`,
);
for (const obj of preparation.dumpedObjects) {
  console.log(`  - ${obj.id} [${obj.type}]`);
}
console.log(`Provedor:    ${provider}${modelOverride ? ` (modelo: ${modelOverride})` : " (modelo default)"}`);
if (images?.length) console.log(`Imagens:     ${images.length} anexada(s) como evidência visual`);
if (techLeadComment) console.log("Tech lead:   comentário anexado ao prompt");

if (flags["dry-run"] === "true") {
  console.log("\n(--dry-run: nada foi enviado à API)");
  process.exit(0);
}

console.log("\nChamando o modelo...\n");
const diagnosis = await useCase.diagnose(preparation, ticketText, images, techLeadComment);

console.log("========== DIAGNÓSTICO ==========\n");
console.log(diagnosis.text);
console.log("\n==================================");
console.log(
  `\n[${diagnosis.model} | stop_reason: ${diagnosis.stopReason} | ${diagnosis.usage.inputTokens} in / ${diagnosis.usage.outputTokens} out]`,
);

if (flags["out"]) {
  mkdirSync(dirname(flags["out"]), { recursive: true });
  writeFileSync(flags["out"], diagnosis.text, "utf-8");
  console.log(`\nSalvo em ${flags["out"]}`);
}
