/**
 * Um chamado (ticket) resolvido, cadastrado manualmente (ver docs/09 — sem
 * scraping nem integração automática com o sistema de chamados: decisão
 * explícita do SPEC §14, "origem dos tickets históricos").
 */
export interface Ticket {
  id: string;
  /** Identificador do sistema de chamados de origem (ex: "SMART-51120"). */
  externalId: string;
  title: string;
  descriptionRaw: string;
  /** Causa raiz + correção real, como resolvida — não a suposição inicial do chamado. */
  resolutionText: string;
  module: string | null;
  versionAffected: string | null;
  resolvedAt: string;
  createdAt: string;
}

/**
 * `TicketObjectLink` é o elo do SPEC §13.6: liga um ticket resolvido ao(s)
 * objeto(s) reais de causa raiz. `objectId` é o `PBObject.id`
 * (`${library}/${name}`), estável entre reingestões enquanto o objeto não for
 * renomeado/movido — ver domain/entities/pb-object.ts.
 */
export interface TicketObjectLink {
  id: string;
  ticketId: string;
  objectId: string;
  /** Evento/função específico, quando a causa raiz é granular (ver docs/04). */
  event: { owner: string; name: string } | null;
  /** Sempre "confirmed" hoje (entrada 100% manual); "inferred" fica reservado
   * para quando o motor de diagnóstico puder propor links automaticamente. */
  confidence: "confirmed" | "inferred";
  notes: string | null;
  createdAt: string;
}
