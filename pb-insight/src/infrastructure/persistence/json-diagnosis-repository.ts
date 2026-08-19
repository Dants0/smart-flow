import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SavedDiagnosis } from "../../domain/entities/saved-diagnosis.js";
import type { IDiagnosisRepository } from "../../application/ports/diagnosis-repository.port.js";

interface DiagnosesFile {
  diagnoses: SavedDiagnosis[];
}

/** Mesmo padrão de JsonTicketRepository/JsonObjectRepository — ver comentário lá (DIP: Postgres pode substituir depois). */
export class JsonDiagnosisRepository implements IDiagnosisRepository {
  private diagnoses = new Map<string, SavedDiagnosis>();

  constructor(private readonly storagePath?: string) {}

  static load(storagePath: string): JsonDiagnosisRepository {
    const repo = new JsonDiagnosisRepository(storagePath);
    if (existsSync(storagePath)) {
      const raw = JSON.parse(readFileSync(storagePath, "utf-8")) as DiagnosesFile;
      for (const d of raw.diagnoses) repo.diagnoses.set(d.id, d);
    }
    return repo;
  }

  async save(diagnosis: SavedDiagnosis): Promise<void> {
    this.diagnoses.set(diagnosis.id, diagnosis);
    this.persist();
  }

  async get(id: string): Promise<SavedDiagnosis | null> {
    return this.diagnoses.get(id) ?? null;
  }

  async all(): Promise<SavedDiagnosis[]> {
    return [...this.diagnoses.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.diagnoses.delete(id);
    if (existed) this.persist();
    return existed;
  }

  async markResolved(id: string, ticketId: string): Promise<SavedDiagnosis | null> {
    const diagnosis = this.diagnoses.get(id);
    if (!diagnosis) return null;
    const updated: SavedDiagnosis = { ...diagnosis, resolvedTicketId: ticketId };
    this.diagnoses.set(id, updated);
    this.persist();
    return updated;
  }

  private persist(): void {
    if (!this.storagePath) return;
    mkdirSync(dirname(this.storagePath), { recursive: true });
    const file: DiagnosesFile = { diagnoses: [...this.diagnoses.values()] };
    writeFileSync(this.storagePath, JSON.stringify(file), "utf-8");
  }
}
