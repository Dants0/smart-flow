import type { FastifyInstance } from "fastify";
import { SearchUseCase } from "../../../application/use-cases/search/search.use-case.js";
import { PB_OBJECT_TYPES, type PBObjectType } from "../../../domain/value-objects/pb-object-type.js";
import type { AppContext } from "../app-context.js";
import { objectSummary, objectSummarySchema } from "../dto.js";

interface SearchQuery {
  q: string;
  limit?: number;
  /** CSV, ex: "Window,DataWindow" — filtra por PBObjectType antes de aplicar `limit`. */
  types?: string;
}

export function registerSearchRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get<{ Querystring: SearchQuery }>(
    "/search",
    {
      schema: {
        tags: ["search"],
        summary: "Busca por palavra-chave — em texto visível na tela (UI) e em corpos de evento/função",
        description:
          'Liga uma palavra-chave do chamado (ex.: "Período", "ScrollToRow") ao objeto real e, quando o match é em código, ao evento/controle exato onde aparece — sem precisar saber de antemão qual objeto procurar.',
        querystring: {
          type: "object",
          required: ["q"],
          properties: {
            q: { type: "string", minLength: 1, description: 'Palavra-chave, ex: "Período" ou "ScrollToRow"' },
            limit: { type: "number", default: 20, minimum: 1, maximum: 200 },
            types: {
              type: "string",
              description: `CSV de PBObjectType para filtrar (ex.: "Window,DataWindow"). Tipos válidos: ${PB_OBJECT_TYPES.join(", ")}.`,
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              query: { type: "string" },
              count: { type: "number" },
              matches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    kind: { type: "string", enum: ["ui_string", "event"] },
                    matchedText: { type: "string" },
                    object: objectSummarySchema,
                    event: {
                      type: "object",
                      nullable: true,
                      properties: {
                        owner: { type: "string" },
                        name: { type: "string" },
                        startLine: { type: "number" },
                        endLine: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { q, limit, types: typesParam } = request.query;

      let types: PBObjectType[] | undefined;
      if (typesParam) {
        const requested = typesParam.split(",").map((t) => t.trim());
        const invalid = requested.filter((t) => !PB_OBJECT_TYPES.includes(t as PBObjectType));
        if (invalid.length > 0) {
          return reply.code(400).send({
            error: `Tipo(s) inválido(s): ${invalid.join(", ")}. Use um de: ${PB_OBJECT_TYPES.join(", ")}.`,
          });
        }
        types = requested as PBObjectType[];
      }

      const matches = new SearchUseCase(ctx.searchIndex).execute(q, limit ?? 20, types);
      return {
        query: q,
        count: matches.length,
        matches: matches.map((m) => ({
          kind: m.kind,
          matchedText: m.matchedText,
          object: objectSummary(m.object),
          event: m.event ?? null,
        })),
      };
    },
  );
}
