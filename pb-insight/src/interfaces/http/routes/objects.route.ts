import type { FastifyInstance } from "fastify";
import { FindEventUseCase } from "../../../application/use-cases/find-event/find-event.use-case.js";
import { FindPatternSiblingsUseCase } from "../../../application/use-cases/find-pattern-siblings/find-pattern-siblings.use-case.js";
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

  app.get<{ Params: { name: string; eventName: string }; Querystring: { owner: string; limit?: number } }>(
    "/objects/:name/events/:eventName/siblings",
    {
      schema: {
        tags: ["objects"],
        summary: "Outras ocorrências do mesmo evento no mesmo tipo de controle, em todo o ws_objects",
        description:
          "Responde 'quem mais tem este mesmo trecho?'. Janelas que só compartilham o ancestral do controle " +
          "não têm aresta entre si e não aparecem em /objects/:name/context — este endpoint existe para " +
          "fechar essa lacuna e evitar corrigir 1 objeto quando N têm o mesmo defeito (ver docs/16). " +
          "A busca é pelo TIPO do controle (e pelos tipos que herdam dele), não pelo nome. " +
          "Ordenado por PBL do objeto raiz primeiro.",
        params: {
          type: "object",
          required: ["name", "eventName"],
          properties: { name: { type: "string" }, eventName: { type: "string" } },
        },
        querystring: {
          type: "object",
          required: ["owner"],
          properties: {
            owner: { type: "string", description: "Controle dono do evento no objeto raiz (ex.: dw_pac01tab)." },
            limit: { type: "number", minimum: 1, maximum: 200, description: "Teto de ocorrências retornadas." },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, eventName } = request.params;
      const { owner, limit } = request.query;

      const root = (await ctx.repository.findByName(name.toLowerCase()))[0];
      if (!root) {
        return reply.code(404).send({ error: `Objeto "${name}" não encontrado.` });
      }

      const result = await new FindPatternSiblingsUseCase(ctx.repository).execute(root, owner, eventName);
      if (!result) {
        return reply.code(404).send({ error: `Controle "${owner}" não encontrado em "${name}".` });
      }

      const all = result.siblings;
      const siblings = limit ? all.slice(0, limit) : all;
      return {
        root: objectSummary(root),
        controlType: result.controlType,
        controlTypes: result.controlTypes,
        count: siblings.length,
        truncated: siblings.length < all.length,
        siblings: siblings.map((s) => ({
          object: objectSummary(s.object),
          control: s.control.name,
          event: {
            name: s.event.name,
            kind: s.event.kind,
            body: s.event.body,
            startLine: s.event.startLine,
            endLine: s.event.endLine,
          },
        })),
      };
    },
  );
}
