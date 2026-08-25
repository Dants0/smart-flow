import type { FastifyInstance } from "fastify";
import { DiagnoseTicketUseCase } from "../../../application/use-cases/diagnose-ticket/diagnose-ticket.use-case.js";
import type { DiagnosticImage } from "../../../application/ports/llm-client.port.js";
import type { DependencyType } from "../../../domain/entities/object-dependency.js";
import { ALLOWED_IMAGE_MEDIA_TYPES, isValidImageMediaType } from "../../../domain/value-objects/image-media-type.js";
import { isValidLLMProvider, LLM_PROVIDERS } from "../../../infrastructure/llm/llm-client-factory.js";
import type { AppContext } from "../app-context.js";
import { objectSummary } from "../dto.js";

const ALL_RELATION_TYPES: DependencyType[] = ["inherits", "embeds", "references", "opens", "function_call"];

interface DiagnoseBody {
  objectName: string;
  ticketText: string;
  hops?: number;
  relations?: DependencyType[] | "all" | "none";
  event?: { owner: string; name: string };
  provider?: string;
  model?: string;
  dryRun?: boolean;
  /** Screenshots/prints em base64 (sem prefixo data:...;base64,) — evidência visual do bug. */
  images?: DiagnosticImage[];
  /** Sugestão do tech lead sobre o chamado, quando existir — colada no prompt como pista a verificar, não fato dado. */
  techLeadComment?: string;
  /** Teto de ocorrências irmãs do mesmo evento no contexto (só com `event`). 0 desliga. */
  maxSiblings?: number;
}

export function registerDiagnoseRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post<{ Body: DiagnoseBody }>(
    "/diagnose",
    {
      schema: {
        tags: ["diagnose"],
        summary: "Motor de diagnóstico grounded",
        description:
          "ATENÇÃO — CUSTO REAL: chama a API do provedor escolhido salvo quando dryRun=true. " +
          "Monta o contexto (objeto/evento + ancestrais + dependências) e pede um diagnóstico de causa raiz " +
          "no formato Causa raiz / Correção sugerida / Evidência / Confiança. Use dryRun=true para orçar o " +
          'tamanho do contexto antes de gastar. `provider` escolhe "claude" (default, claude-sonnet-5) ou ' +
          '"openai" (gpt-4o-mini); `model` sobrescreve o modelo default de qualquer um dos dois. ' +
          "`images` anexa screenshots como evidência visual (ambos os provedores suportam visão) — aumenta " +
          "o custo da chamada (imagens contam como tokens de entrada); não é enviado quando dryRun=true.",
        body: {
          type: "object",
          required: ["objectName", "ticketText"],
          properties: {
            objectName: { type: "string" },
            ticketText: { type: "string" },
            hops: { type: "number", default: 1, minimum: 1, maximum: 5 },
            relations: {
              description: 'Array de tipos de relação, ou "all"/"none". Default: ["embeds","references"].',
              anyOf: [
                { type: "array", items: { type: "string", enum: ALL_RELATION_TYPES } },
                { type: "string", enum: ["all", "none"] },
              ],
            },
            event: {
              type: "object",
              description:
                "Quando presente, troca o dump do objeto raiz inteiro por só este evento isolado — e anexa ao " +
                "contexto as outras ocorrências do mesmo evento no mesmo tipo de controle em todo o ws_objects " +
                "(bloco de abrangência), para o diagnóstico não apontar 1 objeto quando N têm o mesmo defeito.",
              required: ["owner", "name"],
              properties: { owner: { type: "string" }, name: { type: "string" } },
            },
            maxSiblings: {
              type: "number",
              minimum: 0,
              maximum: 200,
              description:
                "Teto de ocorrências irmãs anexadas ao contexto (default 40, só tem efeito junto com `event`). " +
                "0 desliga o bloco de abrangência. Cada ocorrência custa até ~2 KB de contexto.",
            },
            provider: {
              type: "string",
              enum: [...LLM_PROVIDERS],
              default: "claude",
              description: "claude (default, claude-sonnet-5) ou openai (gpt-4o-mini) — ver PB_INSIGHT_MODEL/PB_INSIGHT_OPENAI_MODEL para trocar o modelo default do servidor.",
            },
            model: { type: "string", description: "Sobrescreve o modelo default do provedor escolhido." },
            dryRun: {
              type: "boolean",
              default: false,
              description: "Se true, só monta e reporta o contexto — não chama o LLM nem gasta tokens.",
            },
            images: {
              type: "array",
              description:
                "Screenshots/prints como evidência visual (ex: tela mostrando o erro). Ambos os provedores (Claude e GPT-4o-mini) suportam visão.",
              items: {
                type: "object",
                required: ["mediaType", "base64Data"],
                properties: {
                  mediaType: {
                    type: "string",
                    description: `Um de: ${ALLOWED_IMAGE_MEDIA_TYPES.join(", ")}. Validado no handler (não no schema) para retornar uma mensagem de erro descritiva.`,
                  },
                  base64Data: { type: "string", description: "Conteúdo do arquivo em base64, sem o prefixo data:...;base64,." },
                },
              },
            },
            techLeadComment: {
              type: "string",
              description:
                "Sugestão/observação de um tech lead sobre o chamado, quando existir (ex.: colada do próprio chamado). " +
                "Vai para o prompt como pista humana a verificar contra o código, não como fato aceito de antemão.",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { objectName, ticketText, hops, relations, event, provider, model, dryRun, images, techLeadComment, maxSiblings } =
        request.body;

      if (provider && !isValidLLMProvider(provider)) {
        return reply.code(400).send({ error: `Provedor "${provider}" inválido. Use um de: ${LLM_PROVIDERS.join(", ")}.` });
      }

      const invalidImage = images?.find((img) => !isValidImageMediaType(img.mediaType));
      if (invalidImage) {
        return reply.code(400).send({
          error: `mediaType "${invalidImage.mediaType}" inválido. Use um de: ${ALLOWED_IMAGE_MEDIA_TYPES.join(", ")}.`,
        });
      }

      const relationTypes: DependencyType[] =
        relations === "all"
          ? ALL_RELATION_TYPES
          : relations === "none"
            ? []
            : (relations ?? ["embeds", "references"]);

      const llm = ctx.createLLMClient(provider, model);
      const useCase = new DiagnoseTicketUseCase(ctx.repository, ctx.sourceFiles, llm);

      let preparation;
      try {
        preparation = await useCase.prepare(objectName, hops ?? 1, relationTypes, event, { maxSiblings });
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : String(e) });
      }
      if (!preparation) {
        return reply.code(404).send({ error: `Objeto "${objectName}" não encontrado.` });
      }

      const contextInfo = {
        root: objectSummary(preparation.context.root),
        ancestors: preparation.context.ancestors.map(objectSummary),
        dumpedObjects: preparation.dumpedObjects.map(objectSummary),
        focusedOnEvent: preparation.focusedOnEvent,
        siblings: preparation.siblings.map((s) => ({
          objectId: s.object.id,
          filePath: s.object.filePath,
          control: s.control.name,
          event: s.event.name,
          startLine: s.event.startLine,
          endLine: s.event.endLine,
        })),
        siblingsTruncated: preparation.siblingsTruncated,
        contextSizeChars: preparation.objectContext.length,
        estimatedTokens: Math.round(preparation.objectContext.length / 4),
        imageCount: images?.length ?? 0,
      };

      if (dryRun) {
        return { dryRun: true, provider: provider ?? "claude", context: contextInfo };
      }

      const diagnosis = await useCase.diagnose(preparation, ticketText, images, techLeadComment);
      return { dryRun: false, provider: provider ?? "claude", context: contextInfo, diagnosis };
    },
  );
}
