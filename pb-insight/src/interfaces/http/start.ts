import { existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { buildAppContext } from "./app-context.js";
import { buildServer } from "./build-server.js";
import {
  createLLMClient,
  DEFAULT_LLM_PROVIDER,
  isValidLLMProvider,
} from "../../infrastructure/llm/llm-client-factory.js";
import {
  DEFAULT_DIAGNOSES_PATH,
  DEFAULT_GRAPH_PATH,
  DEFAULT_INGEST_REPORT_PATH,
  DEFAULT_SNAPSHOTS_DIR,
  DEFAULT_TICKETS_PATH,
  DEFAULT_WS_OBJECTS_ROOT,
} from "../cli/shared.js";

// Uso: npm run serve  (variáveis de ambiente opcionais: PORT, HOST,
// PB_INSIGHT_GRAPH, PB_INSIGHT_WS_ROOT, PB_INSIGHT_MODEL, PB_INSIGHT_OPENAI_MODEL)
loadEnv(); // pb-insight/.env, se existir
if (!process.env["ANTHROPIC_API_KEY"] && existsSync("../teste-minimo/.env")) {
  // Reaproveita a chave já configurada no experimento teste-minimo, sem duplicá-la.
  loadEnv({ path: "../teste-minimo/.env" });
}

const port = Number(process.env["PORT"] ?? 3000);
const host = process.env["HOST"] ?? "127.0.0.1";

const context = await buildAppContext({
  graphPath: process.env["PB_INSIGHT_GRAPH"] ?? DEFAULT_GRAPH_PATH,
  wsObjectsRoot: process.env["PB_INSIGHT_WS_ROOT"] ?? DEFAULT_WS_OBJECTS_ROOT,
  snapshotsDir: DEFAULT_SNAPSHOTS_DIR,
  ingestReportPath: DEFAULT_INGEST_REPORT_PATH,
  ticketsPath: process.env["PB_INSIGHT_TICKETS"] ?? DEFAULT_TICKETS_PATH,
  diagnosesPath: process.env["PB_INSIGHT_DIAGNOSES"] ?? DEFAULT_DIAGNOSES_PATH,
  createLLMClient: (provider, model) => {
    const resolved = provider && isValidLLMProvider(provider) ? provider : DEFAULT_LLM_PROVIDER;
    return createLLMClient(resolved, model);
  },
});

const app = await buildServer(context);
await app.listen({ port, host });

console.log(`\nPB Insight API rodando em http://${host}:${port}`);
console.log(`Documentação interativa: http://${host}:${port}/docs\n`);
