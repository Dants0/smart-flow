import type { SavedDiagnosis } from "../../domain/entities/saved-diagnosis.js";

export interface IDiagnosisRepository {
  save(diagnosis: SavedDiagnosis): Promise<void>;
  get(id: string): Promise<SavedDiagnosis | null>;
  all(): Promise<SavedDiagnosis[]>;
  delete(id: string): Promise<boolean>;
  markResolved(id: string, ticketId: string): Promise<SavedDiagnosis | null>;
}
