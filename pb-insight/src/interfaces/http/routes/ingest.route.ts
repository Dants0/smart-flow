import type { FastifyInstance } from "fastify";
import type { AppContext } from "../app-context.js";
import { reloadContext } from "../reload-context.js";

interface IngestBody {
  label?: string;
}

export function registerIngestRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post<{ Body: IngestBody | undefined }>(
    "/ingest",
    {
      schema: {
        tags: ["versioning"],
        summary: "Reingesta o ws_objects do zero (assíncrono, ~40-50s)",
        description:
          "Roda num processo separado — não bloqueia o resto da API enquanto processa. Ao terminar com " +
          "sucesso, o servidor já passa a servir os dados novos automaticamente (sem precisar reiniciar " +
          "nem chamar /reload à parte). Acompanhe o progresso em GET /ingest/status. Retorna 409 se já " +
          "houver uma ingestão em andamento. Corpo é opcional: `{\"label\": \"...\"}`, `{}` ou nenhum corpo.",
        // De propósito SEM `body` no schema: um POST sem corpo/content-type
        // chega como `request.body === undefined`, e a validação AJV do
        // Fastify rejeita isso com 400 contra qualquer schema `type:
        // "object"` — mesmo com toda propriedade opcional. Ausência de corpo
        // é uso legítimo aqui (label é opcional), não erro do cliente, então
        // deixamos sem validação de schema e lemos `request.body?.label`
        // manualmente no handler.
      },
    },
    async (request, reply) => {
      const state = ctx.ingestJobs.start({
        rootDir: ctx.wsObjectsRoot,
        label: request.body?.label,
        graphPath: ctx.graphPath,
        reportPath: ctx.ingestReportPath,
        onDone: async () => {
          await reloadContext(ctx);
        },
      });

      if (!state) {
        return reply.code(409).send({ error: "Já existe uma ingestão em andamento — acompanhe em GET /ingest/status." });
      }
      return reply.code(202).send(state);
    },
  );

  app.get(
    "/ingest/status",
    {
      schema: {
        tags: ["versioning"],
        summary: "Status da ingestão em andamento (ou da última concluída)",
      },
    },
    async () => ctx.ingestJobs.getState(),
  );

  app.post(
    "/reload",
    {
      schema: {
        tags: ["versioning"],
        summary: "Recarrega o grafo em memória a partir do graph.json atual (rápido — não reprocessa o ws_objects)",
        description:
          "Use depois de rodar `npm run ingest` manualmente no terminal, ou sempre que algo mais já " +
          "atualizou .data/graph.json e você quer que este servidor sirva os dados novos sem reiniciar. " +
          "POST /ingest já chama isso sozinho ao terminar — não é preciso encadear os dois manualmente.",
      },
    },
    async (_request, reply) => {
      try {
        const result = await reloadContext(ctx);
        return { status: "ok", ...result };
      } catch (e) {
        return reply.code(500).send({ error: e instanceof Error ? e.message : String(e) });
      }
    },
  );
}
