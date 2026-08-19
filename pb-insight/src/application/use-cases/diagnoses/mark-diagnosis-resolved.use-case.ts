import type { Ticket, TicketObjectLink } from "../../../domain/entities/ticket.js";
import type { IDiagnosisRepository } from "../../ports/diagnosis-repository.port.js";
import type { AddTicketUseCase } from "../tickets/add-ticket.use-case.js";
import type { LinkTicketToObjectUseCase } from "../tickets/link-ticket.use-case.js";

export interface MarkDiagnosisResolvedInput {
  diagnosisId: string;
  /** Id do chamado no sistema de origem (ex: "SMART-51120") — vira o Ticket.externalId. */
  externalId: string;
  title?: string;
  notes?: string;
}

export interface MarkDiagnosisResolvedResult {
  ticket: Ticket;
  link: TicketObjectLink;
}

/**
 * "Dar como solucionado": fecha o loop de feedback humano do SPEC §1 —
 * transforma um diagnóstico já confirmado como correto num `Ticket` +
 * `TicketObjectLink` reais, alimentando a base de conhecimento (§13.5/13.6)
 * com um caso validado. Sem isso, cada diagnóstico gerado seria descartado
 * mesmo quando confirma a causa raiz de verdade.
 */
export class MarkDiagnosisResolvedUseCase {
  constructor(
    private readonly diagnosisRepo: IDiagnosisRepository,
    private readonly addTicket: AddTicketUseCase,
    private readonly linkTicket: LinkTicketToObjectUseCase,
  ) {}

  async execute(input: MarkDiagnosisResolvedInput): Promise<MarkDiagnosisResolvedResult> {
    const diagnosis = await this.diagnosisRepo.get(input.diagnosisId);
    if (!diagnosis) {
      throw new Error(`Diagnóstico "${input.diagnosisId}" não encontrado.`);
    }
    if (diagnosis.resolvedTicketId) {
      throw new Error(`Diagnóstico já marcado como solucionado (ticket ${diagnosis.resolvedTicketId}).`);
    }

    const ticket = await this.addTicket.execute({
      externalId: input.externalId,
      title: input.title ?? `Diagnóstico automático — ${diagnosis.objectName}`,
      descriptionRaw: diagnosis.ticketText,
      resolutionText: diagnosis.diagnosisText,
      resolvedAt: new Date().toISOString(),
    });

    const { link } = await this.linkTicket.execute({
      ticketRef: ticket.id,
      objectName: diagnosis.objectName,
      event: diagnosis.event ?? undefined,
      notes: input.notes ?? "Gerado a partir de diagnóstico automático confirmado como correto.",
    });

    await this.diagnosisRepo.markResolved(diagnosis.id, ticket.id);
    return { ticket, link };
  }
}
