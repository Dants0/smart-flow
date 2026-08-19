import type { SavedDiagnosis } from "../../../domain/entities/saved-diagnosis.js";
import type { IDiagnosisRepository } from "../../ports/diagnosis-repository.port.js";

export interface SaveDiagnosisInput {
  objectId: string;
  objectName: string;
  event?: { owner: string; name: string } | null;
  ticketText: string;
  techLeadComment?: string | null;
  diagnosisText: string;
  provider: string;
  model: string;
  dumpedObjectIds: string[];
  contextSizeChars: number;
  estimatedTokens: number;
  imageCount: number;
}

/** Persiste um diagnóstico já gerado (a chamada ao LLM já aconteceu em POST /diagnose) — salvar é uma ação manual separada. */
export class SaveDiagnosisUseCase {
  constructor(private readonly repo: IDiagnosisRepository) {}

  async execute(input: SaveDiagnosisInput): Promise<SavedDiagnosis> {
    const diagnosis: SavedDiagnosis = {
      id: crypto.randomUUID(),
      objectId: input.objectId,
      objectName: input.objectName,
      event: input.event ?? null,
      ticketText: input.ticketText,
      techLeadComment: input.techLeadComment?.trim() || null,
      diagnosisText: input.diagnosisText,
      provider: input.provider,
      model: input.model,
      dumpedObjectIds: input.dumpedObjectIds,
      contextSizeChars: input.contextSizeChars,
      estimatedTokens: input.estimatedTokens,
      imageCount: input.imageCount,
      createdAt: new Date().toISOString(),
      resolvedTicketId: null,
    };
    await this.repo.save(diagnosis);
    return diagnosis;
  }
}
