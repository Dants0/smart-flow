import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Ticket, TicketObjectLink } from "../../domain/entities/ticket.js";
import type { ITicketRepository, SimilarTicket } from "../../application/ports/ticket-repository.port.js";

interface TicketsFile {
  tickets: Array<{ ticket: Ticket; embedding: number[] }>;
  links: TicketObjectLink[];
}

/**
 * Repositório de tickets em JSON, mesmo padrão do JsonObjectRepository
 * (ver comentário lá): serve a escala atual (cadastro manual, dezenas a
 * poucas centenas de tickets); um adapter Postgres+pgvector pode substituir
 * esta classe atrás da mesma porta sem tocar nos use cases (DIP).
 *
 * Ao contrário do grafo de código (um snapshot completo por ingestão), tickets
 * são adicionados um a um ao longo do tempo — por isso cada `addTicket`/
 * `addLink` reescreve o arquivo inteiro (barato nesta escala) em vez de
 * substituir um snapshot completo.
 */
export class JsonTicketRepository implements ITicketRepository {
  private tickets = new Map<string, { ticket: Ticket; embedding: number[] }>();
  private links: TicketObjectLink[] = [];

  constructor(private readonly storagePath?: string) {}

  static load(storagePath: string): JsonTicketRepository {
    const repo = new JsonTicketRepository(storagePath);
    if (existsSync(storagePath)) {
      const raw = JSON.parse(readFileSync(storagePath, "utf-8")) as TicketsFile;
      for (const entry of raw.tickets) repo.tickets.set(entry.ticket.id, entry);
      repo.links = raw.links;
    }
    return repo;
  }

  async addTicket(ticket: Ticket, embedding: number[]): Promise<void> {
    this.tickets.set(ticket.id, { ticket, embedding });
    this.persist();
  }

  async getTicket(id: string): Promise<Ticket | null> {
    return this.tickets.get(id)?.ticket ?? null;
  }

  async findByExternalId(externalId: string): Promise<Ticket | null> {
    for (const { ticket } of this.tickets.values()) {
      if (ticket.externalId.toLowerCase() === externalId.toLowerCase()) return ticket;
    }
    return null;
  }

  async allTickets(): Promise<Ticket[]> {
    return [...this.tickets.values()].map((e) => e.ticket);
  }

  async deleteTicket(id: string): Promise<boolean> {
    const existed = this.tickets.delete(id);
    if (!existed) return false;
    this.links = this.links.filter((l) => l.ticketId !== id);
    this.persist();
    return true;
  }

  async addLink(link: TicketObjectLink): Promise<void> {
    this.links.push(link);
    this.persist();
  }

  async linksForTicket(ticketId: string): Promise<TicketObjectLink[]> {
    return this.links.filter((l) => l.ticketId === ticketId);
  }

  async linksForObject(objectId: string): Promise<TicketObjectLink[]> {
    return this.links.filter((l) => l.objectId === objectId);
  }

  async findSimilar(embedding: number[], limit: number): Promise<SimilarTicket[]> {
    return [...this.tickets.values()]
      .map(({ ticket, embedding: e }) => ({ ticket, score: cosineSimilarity(embedding, e) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private persist(): void {
    if (!this.storagePath) return;
    mkdirSync(dirname(this.storagePath), { recursive: true });
    const file: TicketsFile = {
      tickets: [...this.tickets.values()],
      links: this.links,
    };
    writeFileSync(this.storagePath, JSON.stringify(file), "utf-8");
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
