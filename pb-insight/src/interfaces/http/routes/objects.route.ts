import type { FastifyInstance } from "fastify";
import { FindEventUseCase } from "../../../application/use-cases/find-event/find-event.use-case.js";
import { QueryObjectContextUseCase } from "../../../application/use-cases/query-object-context/query-object-context.use-case.js";
import type { AppContext } from "../app-context.js";
import { objectSummary, objectSummarySchema } from "../dto.js";

export function registerObjectRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get<{ Params: { name: string } }>(
    "/objects/:name",
    {
      schema: {
        tags: ["objects"],
        summary: "Detalhe completo de um objeto (controles, dataobjects, eventos, colunas — conforme o tipo)",
        params: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const objects = await ctx.repository.findByName(request.params.name);
      if (objects.length === 0) {
        return reply.code(404).send({ error: `Objeto "${request.params.name}" não encontrado.` });
      }
      return { query: request.params.name, count: objects.length, objects };
    },
  );

  app.get<{ Params: { name: string }; Querystring: { hops?: number } }>(
    "/objects/:name/context",
    {
      schema: {
        tags: ["objects"],
        summary: "Ancestrais + dependências diretas de um objeto (grafo expandido em N saltos)",
        params: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
        querystring: {
          type: "object",
          properties: { hops: { type: "number", default: 2, minimum: 1, maximum: 5 } },
        },
        response: {
          200: {
            type: "object",
            properties: {
              root: objectSummarySchema,
              ancestors: { type: "array", items: objectSummarySchema },
              related: {
                type: "array",
                items: {
                  type: "object",
                  properties: { object: objectSummarySchema, via: { type: "string" }, depth: { type: "number" } },
                },
              },
              dependents: {
                type: "array",
                items: {
                  type: "object",
                  properties: { object: objectSummarySchema, via: { type: "string" } },
                },
              },
              ambiguities: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { name } = request.params;
      const hops = request.query.hops ?? 2;
      const context = await new QueryObjectContextUseCase(ctx.repository).execute(name, hops);
      if (!context) {
        return reply.code(404).send({ error: `Objeto "${name}" não encontrado.` });
      }
      return {
        root: objectSummary(context.root),
        ancestors: context.ancestors.map(objectSummary),
        related: context.related.map((r) => ({ object: objectSummary(r.object), via: r.via.type, depth: r.depth })),
        dependents: context.dependents.map((d) => ({ object: objectSummary(d.object), via: d.via.type })),
        ambiguities: context.ambiguities,
      };
    },
  );

  app.get<{ Params: { name: string; eventName: string }; Querystring: { owner?: string } }>(
    "/objects/:name/events/:eventName",
    {
      schema: {
        tags: ["objects"],
        summary: "Corpo de um evento/função específico — navegação direta sem abrir o PowerBuilder",
        description:
          "Retorna todas as ocorrências quando mais de um controle tem evento de mesmo nome; use ?owner= para desambiguar.",
        params: {
          type: "object",
          required: ["name", "eventName"],
          properties: { name: { type: "string" }, eventName: { type: "string" } },
        },
        querystring: {
          type: "object",
          properties: { owner: { type: "string", description: "Controle dono, para desambiguar" } },
        },
      },
    },
    async (request, reply) => {
      const { name, eventName } = request.params;
      const matches = await new FindEventUseCase(ctx.repository).execute(name, eventName, request.query.owner);
      if (matches.length === 0) {
        return reply.code(404).send({ error: `Evento "${eventName}" não encontrado em "${name}".` });
      }
      return { count: matches.length, matches };
    },
  );
}
