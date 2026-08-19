import type { FastifyInstance } from "fastify";
import type { AppContext } from "../app-context.js";

export function registerHealthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get(
    "/health",
    {
      schema: {
        tags: ["health"],
        summary: "Status do serviço e da versão do grafo carregado em memória",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              version: {
                type: "object",
                nullable: true,
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  ingestedAt: { type: "string" },
                  sourceHash: { type: "string" },
                  objectCount: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
    async () => {
      const version = await ctx.repository.getVersion();
      return { status: "ok", version };
    },
  );
}
