import type { TicketObjectLink } from "../../../domain/entities/ticket.js";
import type { IObjectRepository } from "../../ports/object-repository.port.js";
import type { ITicketRepository } from "../../ports/ticket-repository.port.js";

export interface LinkTicketInput {
  /** Aceita tanto o id interno do ticket quanto o externalId (ex: "SMART-51120"). */
  ticketRef: string;
  objectName: string;
  event?: { owner: string; name: string };
  notes?: string | null;
}

export interface LinkTicketResult {
  link: TicketObjectLink;
  /** Preenchido quando `objectName` colide entre PBLs (mesmo padrão de QueryObjectContextUseCase). */
  ambiguities: string[];
}

/**
 * `ticket_object_links` (SPEC §13.6) — o elo que transforma "ticket
 * resolvido" em dado estruturado ligado ao objeto real de causa raiz.
 * Sempre `confidence: "confirmed"` porque a entrada é 100% manual (decisão
 * do usuário: sem scraping, sem inferência automática por ora).
 */
export class LinkTicketToObjectUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly objectRepo: IObjectRepository,
  ) {}

  async execute(input: LinkTicketInput): Promise<LinkTicketResult> {
    const ticket =
      (await this.ticketRepo.getTicket(input.ticketRef)) ??
      (await this.ticketRepo.findByExternalId(input.ticketRef));
    if (!ticket) {
      throw new Error(`Ticket "${input.ticketRef}" não encontrado.`);
    }

    const matches = await this.objectRepo.findByName(input.objectName.toLowerCase());
    const object = matches[0];
    if (!object) {
      throw new Error(`Objeto "${input.objectName}" não encontrado no grafo.`);
    }
    const ambiguities =
      matches.length > 1 ? [`${input.objectName}: ${matches.map((m) => m.id).join(", ")}`] : [];

    if (input.event) {
      const owner = input.event.owner.toLowerCase();
      const name = input.event.name.toLowerCase();
      const found = (object.structured.events ?? []).some((e) => e.owner === owner && e.name === name);
      if (!found) {
        throw new Error(`Evento "${input.event.name}" do controle "${input.event.owner}" não encontrado em ${object.id}.`);
      }
    }

    const link: TicketObjectLink = {
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      objectId: object.id,
      event: input.event ?? null,
      confidence: "confirmed",
      notes: input.notes ?? null,
      createdAt: new Date().toISOString(),
    };

    await this.ticketRepo.addLink(link);
    return { link, ambiguities };
  }
}
