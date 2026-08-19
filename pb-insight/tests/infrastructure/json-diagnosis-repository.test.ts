import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SavedDiagnosis } from "../../src/domain/entities/saved-diagnosis.js";
import { JsonDiagnosisRepository } from "../../src/infrastructure/persistence/json-diagnosis-repository.js";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "pb-insight-diagnoses-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeDiagnosis(overrides: Partial<SavedDiagnosis> = {}): SavedDiagnosis {
  return {
    id: crypto.randomUUID(),
    objectId: "ag/ag/w_confirm_agm",
    objectName: "w_confirm_agm",
    event: null,
    ticketText: "chamado",
    techLeadComment: null,
    diagnosisText: "causa raiz: x",
    provider: "claude",
    model: "claude-sonnet-5",
    dumpedObjectIds: ["ag/ag/w_confirm_agm"],
    contextSizeChars: 100,
    estimatedTokens: 25,
    imageCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    resolvedTicketId: null,
    ...overrides,
  };
}

describe("JsonDiagnosisRepository", () => {
  it("persiste e sobrevive a reload a partir do disco", async () => {
    const path = join(workDir, "diagnoses.json");
    const repo = new JsonDiagnosisRepository(path);
    const diagnosis = makeDiagnosis();
    await repo.save(diagnosis);

    const reloaded = JsonDiagnosisRepository.load(path);
    expect(await reloaded.get(diagnosis.id)).toEqual(diagnosis);
  });

  it("all() retorna mais recente primeiro", async () => {
    const repo = new JsonDiagnosisRepository();
    await repo.save(makeDiagnosis({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" }));
    await repo.save(makeDiagnosis({ id: "b", createdAt: "2026-02-01T00:00:00.000Z" }));
    expect((await repo.all()).map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("delete remove e retorna false para id inexistente", async () => {
    const repo = new JsonDiagnosisRepository();
    await repo.save(makeDiagnosis({ id: "a" }));
    expect(await repo.delete("a")).toBe(true);
    expect(await repo.get("a")).toBeNull();
    expect(await repo.delete("a")).toBe(false);
  });

  it("markResolved atualiza resolvedTicketId e retorna null para id inexistente", async () => {
    const repo = new JsonDiagnosisRepository();
    await repo.save(makeDiagnosis({ id: "a" }));
    const updated = await repo.markResolved("a", "ticket-1");
    expect(updated?.resolvedTicketId).toBe("ticket-1");
    expect((await repo.get("a"))?.resolvedTicketId).toBe("ticket-1");
    expect(await repo.markResolved("nao-existe", "x")).toBeNull();
  });
});
