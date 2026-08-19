import type { Ticket } from "../../../domain/entities/ticket.js";
import type { IEmbeddingProvider } from "../../ports/embedding-provider.port.js";
import type { ITicketRepository } from "../../ports/ticket-repository.port.js";

export interface AddTicketInput {
  externalId: string;
  title: string;
  descriptionRaw: string;
  resolutionText: string;
  module?: string | null;
  versionAffected?: string | null;
  resolvedAt: string;
}

/**
 * Cadastro manual de um ticket resolvido (SPEC §13.5). O embedding é
 * calculado sobre título + descrição + resolução juntos — a resolução real
 * é o que dá sinal de causa raiz para a busca por similaridade encontrar
 * casos parecidos no futuro (ver docs/09).
 */
export class AddTicketUseCase {
  constructor(
    private readonly repo: ITicketRepository,
    private readonly embeddings: IEmbeddingProvider,
  ) {}

  async execute(input: AddTicketInput): Promise<Ticket> {
    const existing = await this.repo.findByExternalId(input.externalId);
    if (existing) {
      throw new Error(`Ticket "${input.externalId}" já cadastrado (id: ${existing.id}).`);
    }

    const embeddingText = [input.title, input.descriptionRaw, input.resolutionText].join("\n\n");
    const embedding = await this.embeddings.embed(embeddingText);

    const ticket: Ticket = {
      id: crypto.randomUUID(),
      externalId: input.externalId,
      title: input.title,
      descriptionRaw: input.descriptionRaw,
      resolutionText: input.resolutionText,
      module: input.module ?? null,
      versionAffected: input.versionAffected ?? null,
      resolvedAt: input.resolvedAt,
      createdAt: new Date().toISOString(),
    };

    await this.repo.addTicket(ticket, embedding);
    return ticket;
  }
}
