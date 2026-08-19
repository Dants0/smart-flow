import type { Ticket, TicketObjectLink } from "../../../domain/entities/ticket.js";
import type { IEmbeddingProvider } from "../../ports/embedding-provider.port.js";
import type { ITicketRepository } from "../../ports/ticket-repository.port.js";

export interface SimilarTicketResult {
  ticket: Ticket;
  score: number;
  links: TicketObjectLink[];
}

/**
 * Busca por similaridade semântica sobre a base de tickets cadastrada
 * manualmente (SPEC §13.5). Retorna também os `ticket_object_links` de cada
 * resultado — é o que dá ao motor de diagnóstico (§13.7, ainda não
 * conectado) um candidato de causa raiz vindo de precedente real, não só do
 * grafo de código.
 */
export class FindSimilarTicketsUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly embeddings: IEmbeddingProvider,
  ) {}

  async execute(queryText: string, limit = 5): Promise<SimilarTicketResult[]> {
    const embedding = await this.embeddings.embed(queryText);
    const similar = await this.ticketRepo.findSimilar(embedding, limit);

    const results: SimilarTicketResult[] = [];
    for (const { ticket, score } of similar) {
      const links = await this.ticketRepo.linksForTicket(ticket.id);
      results.push({ ticket, score, links });
    }
    return results;
  }
}
