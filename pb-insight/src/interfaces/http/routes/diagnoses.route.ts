import type { FastifyInstance } from "fastify";
import { AddTicketUseCase } from "../../../application/use-cases/tickets/add-ticket.use-case.js";
import { LinkTicketToObjectUseCase } from "../../../application/use-cases/tickets/link-ticket.use-case.js";
import { MarkDiagnosisResolvedUseCase } from "../../../application/use-cases/diagnoses/mark-diagnosis-resolved.use-case.js";
import { SaveDiagnosisUseCase } from "../../../application/use-cases/diagnoses/save-diagnosis.use-case.js";
import type { AppContext } from "../app-context.js";

interface SaveDiagnosisBody {
  objectId: string;
  objectName: string;
  event?: { owner: string; name: string };
  ticketText: string;
  techLeadComment?: string;
  diagnosisText: string;
  provider: string;
  model: string;
  dumpedObjectIds: string[];
  contextSizeChars: number;
  estimatedTokens: number;
  imageCount?: number;
}

interface ResolveDiagnosisBody {
  externalId: string;
  title?: string;
  notes?: string;
}

/**
 * Diagnósticos salvos (SPEC §1: "resposta com evidência anexada e confiança
 * calibrada"). Salvar é uma ação manual e separada de `POST /diagnose` — nem
 * todo diagnóstico gerado vale guardar. `POST /diagnoses/:id/resolve` é o elo
 * que fecha o loop de feedback humano: confirma o diagnóstico como correto e
 * gera um Ticket + ticket_object_link reais (ver docs/11).
 */
export function registerDiagnosisRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post<{ Body: SaveDiagnosisBody }>(
    "/diagnoses",
    {
      schema: {
        tags: ["diagnoses"],
        summary: "Salva um diagnóstico já gerado por POST /diagnose",
        description:
          "Não chama o LLM — só persiste o resultado que o cliente já recebeu de POST /diagnose. " +
          "Use para manter um histórico consultável e como base para `POST /diagnoses/:id/resolve`.",
        body: {
          type: "object",
          required: ["objectId", "objectName", "ticketText", "diagnosisText", "provider", "model", "dumpedObjectIds", "contextSizeChars", "estimatedTokens"],
          properties: {
            objectId: { type: "string" },
            objectName: { type: "string" },
            event: {
              type: "object",
              required: ["owner", "name"],
              properties: { owner: { type: "string" }, name: { type: "string" } },
            },
            ticketText: { type: "string" },
            techLeadComment: { type: "string", description: "Sugestão do tech lead sobre o chamado, quando havia uma." },
            diagnosisText: { type: "string" },
            provider: { type: "string" },
            model: { type: "string" },
            dumpedObjectIds: { type: "array", items: { type: "string" } },
            contextSizeChars: { type: "number" },
            estimatedTokens: { type: "number" },
            imageCount: { type: "number", default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const useCase = new SaveDiagnosisUseCase(ctx.diagnosisRepository);
      const saved = await useCase.execute({ ...request.body, imageCount: request.body.imageCount ?? 0 });
      return reply.code(201).send(saved);
    },
  );

  app.get(
    "/diagnoses",
    { schema: { tags: ["diagnoses"], summary: "Lista os diagnósticos salvos, mais recente primeiro" } },
    async () => {
      const diagnoses = await ctx.diagnosisRepository.all();
      return { count: diagnoses.length, diagnoses };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/diagnoses/:id",
    {
      schema: {
        tags: ["diagnoses"],
        summary: "Detalhe de um diagnóstico salvo",
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const diagnosis = await ctx.diagnosisRepository.get(request.params.id);
      if (!diagnosis) return reply.code(404).send({ error: `Diagnóstico "${request.params.id}" não encontrado.` });
      return diagnosis;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/diagnoses/:id",
    {
      schema: {
        tags: ["diagnoses"],
        summary: "Apaga um diagnóstico salvo",
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      },
    },
    async (request, reply) => {
      const deleted = await ctx.diagnosisRepository.delete(request.params.id);
      if (!deleted) return reply.code(404).send({ error: `Diagnóstico "${request.params.id}" não encontrado.` });
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string }; Body: ResolveDiagnosisBody }>(
    "/diagnoses/:id/resolve",
    {
      schema: {
        tags: ["diagnoses"],
        summary: "Dá o diagnóstico como solucionado — cria um Ticket + ticket_object_link a partir dele",
        description:
          "Use quando o diagnóstico gerado foi confirmado como a causa raiz real. `externalId` vira o " +
          "Ticket.externalId (ex: número do chamado no sistema de origem). Chama a API de embedding " +
          "(OpenAI, custo desprezível) para indexar o novo ticket na busca por similaridade.",
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["externalId"],
          properties: {
            externalId: { type: "string", description: 'Ex: "SMART-51120".' },
            title: { type: "string" },
            notes: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const addTicket = new AddTicketUseCase(ctx.ticketRepository, ctx.embeddings);
      const linkTicket = new LinkTicketToObjectUseCase(ctx.ticketRepository, ctx.repository);
      const useCase = new MarkDiagnosisResolvedUseCase(ctx.diagnosisRepository, addTicket, linkTicket);
      try {
        const result = await useCase.execute({ diagnosisId: request.params.id, ...request.body });
        return reply.code(201).send(result);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const notFound = message.includes("não encontrado");
        return reply.code(notFound ? 404 : 400).send({ error: message });
      }
    },
  );
}
