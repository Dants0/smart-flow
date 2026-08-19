import type { FastifyInstance } from "fastify";
import { AddTicketUseCase } from "../../../application/use-cases/tickets/add-ticket.use-case.js";
import { FindSimilarTicketsUseCase } from "../../../application/use-cases/tickets/find-similar-tickets.use-case.js";
import { LinkTicketToObjectUseCase } from "../../../application/use-cases/tickets/link-ticket.use-case.js";
import type { AppContext } from "../app-context.js";

interface AddTicketBody {
  externalId: string;
  title: string;
  descriptionRaw: string;
  resolutionText: string;
  module?: string;
  versionAffected?: string;
  resolvedAt?: string;
}

interface LinkTicketBody {
  objectName: string;
  event?: { owner: string; name: string };
  notes?: string;
}

/**
 * Base de conhecimento de tickets (SPEC §13.5/§13.6) — cadastro 100% manual,
 * sem scraping nem integração automática com o sistema de chamados (ver
 * docs/09). `POST /tickets` e `GET /tickets/similar` chamam a API da OpenAI
 * para embedding (custo desprezível, mas real — text-embedding-3-small).
 */
export function registerTicketRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post<{ Body: AddTicketBody }>(
    "/tickets",
    {
      schema: {
        tags: ["tickets"],
        summary: "Cadastra um ticket resolvido (entrada manual)",
        description:
          "Calcula embedding (OpenAI text-embedding-3-small, custo desprezível) sobre título+descrição+resolução " +
          "para a busca por similaridade em GET /tickets/similar. Falha com 409 se externalId já existe.",
        body: {
          type: "object",
          required: ["externalId", "title", "descriptionRaw", "resolutionText"],
          properties: {
            externalId: { type: "string", description: 'Ex: "SMART-51120".' },
            title: { type: "string" },
            descriptionRaw: { type: "string" },
            resolutionText: { type: "string", description: "Causa raiz + correção real, como resolvida." },
            module: { type: "string" },
            versionAffected: { type: "string" },
            resolvedAt: { type: "string", description: "ISO date; default: agora." },
          },
        },
      },
    },
    async (request, reply) => {
      const useCase = new AddTicketUseCase(ctx.ticketRepository, ctx.embeddings);
      try {
        const ticket = await useCase.execute({
          ...request.body,
          resolvedAt: request.body.resolvedAt ?? new Date().toISOString(),
        });
        return reply.code(201).send(ticket);
      } catch (e) {
        return reply.code(409).send({ error: e instanceof Error ? e.message : String(e) });
      }
    },
  );

  app.get(
    "/tickets",
    { schema: { tags: ["tickets"], summary: "Lista todos os tickets cadastrados" } },
    async () => {
      const tickets = await ctx.ticketRepository.allTickets();
      return { count: tickets.length, tickets };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/tickets/:id",
    {
      schema: {
        tags: ["tickets"],
        summary: "Detalhe de um ticket + seus links de objeto (aceita id interno ou externalId)",
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const ticket =
        (await ctx.ticketRepository.getTicket(request.params.id)) ??
        (await ctx.ticketRepository.findByExternalId(request.params.id));
      if (!ticket) return reply.code(404).send({ error: `Ticket "${request.params.id}" não encontrado.` });
      const links = await ctx.ticketRepository.linksForTicket(ticket.id);
      return { ticket, links };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/tickets/:id",
    {
      schema: {
        tags: ["tickets"],
        summary: "Apaga um ticket cadastrado (aceita id interno ou externalId)",
        description: "Remove também, em cascata, os ticket_object_links desse ticket.",
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const ticket =
        (await ctx.ticketRepository.getTicket(request.params.id)) ??
        (await ctx.ticketRepository.findByExternalId(request.params.id));
      if (!ticket) return reply.code(404).send({ error: `Ticket "${request.params.id}" não encontrado.` });
      await ctx.ticketRepository.deleteTicket(ticket.id);
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string }; Body: LinkTicketBody }>(
    "/tickets/:id/links",
    {
      schema: {
        tags: ["tickets"],
        summary: "Cria um ticket_object_link — liga o ticket ao objeto real de causa raiz",
        description: "`confidence` é sempre \"confirmed\": a entrada é 100% manual.",
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["objectName"],
          properties: {
            objectName: { type: "string" },
            event: {
              type: "object",
              required: ["owner", "name"],
              properties: { owner: { type: "string" }, name: { type: "string" } },
              description: "Quando a causa raiz é um evento/função específico, não o objeto inteiro.",
            },
            notes: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const useCase = new LinkTicketToObjectUseCase(ctx.ticketRepository, ctx.repository);
      try {
        const { link, ambiguities } = await useCase.execute({
          ticketRef: request.params.id,
          objectName: request.body.objectName,
          event: request.body.event,
          notes: request.body.notes,
        });
        return reply.code(201).send({ link, ambiguities });
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
      }
    },
  );

  app.get<{ Querystring: { q?: string; limit?: number } }>(
    "/tickets/similar",
    {
      schema: {
        tags: ["tickets"],
        summary: "Busca tickets semelhantes por similaridade semântica (embedding + cosseno)",
        querystring: {
          type: "object",
          required: ["q"],
          properties: {
            q: { type: "string", description: "Texto do novo chamado a comparar." },
            limit: { type: "number", default: 5, minimum: 1, maximum: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.query.q) return reply.code(400).send({ error: "Parâmetro q é obrigatório." });
      const useCase = new FindSimilarTicketsUseCase(ctx.ticketRepository, ctx.embeddings);
      const results = await useCase.execute(request.query.q, request.query.limit ?? 5);
      return { count: results.length, results };
    },
  );
}
