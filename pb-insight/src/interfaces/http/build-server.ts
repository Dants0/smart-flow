import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "./app-context.js";
import { registerDiagnoseRoutes } from "./routes/diagnose.route.js";
import { registerDiagnosisRoutes } from "./routes/diagnoses.route.js";
import { registerHealthRoutes } from "./routes/health.route.js";
import { registerIngestRoutes } from "./routes/ingest.route.js";
import { registerObjectRoutes } from "./routes/objects.route.js";
import { registerSearchRoutes } from "./routes/search.route.js";
import { registerSnapshotRoutes } from "./routes/snapshots.route.js";
import { registerTicketRoutes } from "./routes/tickets.route.js";

/**
 * Fábrica do app Fastify — separada de `start.ts` para ser testável via
 * `.inject()` sem abrir uma porta de rede de verdade.
 */
export async function buildServer(context: AppContext, options?: { logger?: boolean }): Promise<FastifyInstance> {
  // bodyLimit acima do default (1 MiB) do Fastify: screenshots em base64 anexados
  // a POST /diagnose (evidência visual) facilmente passam disso.
  const app = Fastify({ logger: options?.logger ?? true, bodyLimit: 20 * 1024 * 1024 });

  // Uso local/pessoal com um frontend futuro em outra origem — CORS aberto
  // é aceitável aqui; reavaliar se este servidor um dia for exposto além de localhost.
  //
  // `methods` precisa ser explícito: o default do @fastify/cors é
  // "GET,HEAD,POST" (não reflete as rotas registradas) — sem isso, todo
  // DELETE (apagar ticket, apagar diagnóstico) falha no preflight do
  // navegador com "Failed to fetch", mesmo respondendo certo via `curl`/
  // `.inject()` (que não passam pelo preflight real). Achado ao testar
  // DELETE /tickets/:id de verdade no browser — os testes automatizados
  // não pegam isso porque `.inject()` não simula CORS.
  await app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "DELETE"] });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "PB Insight API",
        version: "0.1.0",
        description:
          "Mapeamento estrutural, busca e diagnóstico grounded do código PowerBuilder do SMART Desktop. " +
          "Ver docs/05-api-http.md no repositório para o guia de uso completo.",
      },
      tags: [
        { name: "health", description: "Status do serviço" },
        { name: "search", description: "Busca por palavra-chave (UI e código)" },
        { name: "objects", description: "Detalhe, contexto e eventos de objetos" },
        { name: "versioning", description: "Ingestão, reload, snapshots e diff entre versões" },
        { name: "diagnose", description: "Motor de diagnóstico grounded (chama o LLM)" },
        { name: "tickets", description: "Base de conhecimento de tickets — cadastro manual + busca por similaridade" },
        { name: "diagnoses", description: "Diagnósticos salvos — histórico + \"dar como solucionado\" (gera Ticket + link)" },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  registerHealthRoutes(app, context);
  registerSearchRoutes(app, context);
  registerObjectRoutes(app, context);
  registerIngestRoutes(app, context);
  registerSnapshotRoutes(app, context);
  registerDiagnoseRoutes(app, context);
  registerDiagnosisRoutes(app, context);
  registerTicketRoutes(app, context);

  return app;
}
