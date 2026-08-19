import type { Ticket, TicketObjectLink } from "../../domain/entities/ticket.js";

export interface SimilarTicket {
  ticket: Ticket;
  score: number;
}

export interface ITicketRepository {
  addTicket(ticket: Ticket, embedding: number[]): Promise<void>;
  getTicket(id: string): Promise<Ticket | null>;
  findByExternalId(externalId: string): Promise<Ticket | null>;
  allTickets(): Promise<Ticket[]>;
  /** Remove o ticket e, em cascata, seus ticket_object_links. Retorna false se o id não existia. */
  deleteTicket(id: string): Promise<boolean>;

  addLink(link: TicketObjectLink): Promise<void>;
  linksForTicket(ticketId: string): Promise<TicketObjectLink[]>;
  linksForObject(objectId: string): Promise<TicketObjectLink[]>;

  /** Similaridade por cosseno entre `embedding` e o embedding de cada ticket, ranking desc. */
  findSimilar(embedding: number[], limit: number): Promise<SimilarTicket[]>;
}
