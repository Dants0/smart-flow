/**
 * Um diagnóstico gerado pelo motor (SPEC §9) e salvo explicitamente pelo
 * usuário — a ação de "salvar" é manual: nem toda chamada a `POST /diagnose`
 * vale a pena guardar (rascunhos, comparações de provedor, etc.).
 *
 * `resolvedTicketId` é o elo com o SPEC §13.6: quando o usuário confirma que
 * o diagnóstico bateu com a causa raiz real ("dar como solucionado"), um
 * `Ticket` + `TicketObjectLink` são criados a partir dele (ver
 * MarkDiagnosisResolvedUseCase) — fecha o loop de feedback humano do SPEC §1.
 */
export interface SavedDiagnosis {
  id: string;
  objectId: string;
  objectName: string;
  event: { owner: string; name: string } | null;
  ticketText: string;
  /** Sugestão do tech lead colada pelo usuário, quando o chamado tinha uma — null quando não informada. */
  techLeadComment: string | null;
  diagnosisText: string;
  provider: string;
  model: string;
  dumpedObjectIds: string[];
  contextSizeChars: number;
  estimatedTokens: number;
  imageCount: number;
  createdAt: string;
  resolvedTicketId: string | null;
}
