import { describe, expect, it } from "vitest";
import type { IEmbeddingProvider } from "../../src/application/ports/embedding-provider.port.js";
import type { IObjectRepository } from "../../src/application/ports/object-repository.port.js";
import { MarkDiagnosisResolvedUseCase } from "../../src/application/use-cases/diagnoses/mark-diagnosis-resolved.use-case.js";
import { SaveDiagnosisUseCase } from "../../src/application/use-cases/diagnoses/save-diagnosis.use-case.js";
import { AddTicketUseCase } from "../../src/application/use-cases/tickets/add-ticket.use-case.js";
import { LinkTicketToObjectUseCase } from "../../src/application/use-cases/tickets/link-ticket.use-case.js";
import type { PBObject } from "../../src/domain/entities/pb-object.js";
import { JsonDiagnosisRepository } from "../../src/infrastructure/persistence/json-diagnosis-repository.js";
import { JsonTicketRepository } from "../../src/infrastructure/persistence/json-ticket-repository.js";

class FakeEmbeddingProvider implements IEmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    return [text.length, 1];
  }
}

function makeObject(overrides: Partial<PBObject> = {}): PBObject {
  return {
    id: "ag/ag/w_confirm_agm",
    type: "Window",
    name: "w_confirm_agm",
    ancestor: null,
    library: "ag/ag",
    filePath: "ag/ag.pbl.src/w_confirm_agm.srw",
    contentHash: "hash",
    structured: { events: [{ kind: "event", owner: "dw_agm18tab", name: "zoom", body: "...", startLine: 1, endLine: 5 }] },
    ...overrides,
  };
}

class FakeObjectRepository implements IObjectRepository {
  constructor(private readonly objects: PBObject[]) {}
  async saveSnapshot(): Promise<void> {}
  async getVersion() {
    return null;
  }
  async findByName(name: string): Promise<PBObject[]> {
    return this.objects.filter((o) => o.name === name);
  }
  async findById(id: string): Promise<PBObject | null> {
    return this.objects.find((o) => o.id === id) ?? null;
  }
  async allObjects(): Promise<PBObject[]> {
    return this.objects;
  }
  async dependenciesOf(): Promise<[]> {
    return [];
  }
  async dependentsOf(): Promise<[]> {
    return [];
  }
  async countObjects(): Promise<number> {
    return this.objects.length;
  }
  async countDependencies(): Promise<number> {
    return 0;
  }
}

const SAVE_INPUT = {
  objectId: "ag/ag/w_confirm_agm",
  objectName: "w_confirm_agm",
  ticketText: "chamado de teste",
  diagnosisText: "Causa raiz: fake",
  provider: "claude",
  model: "claude-sonnet-5",
  dumpedObjectIds: ["ag/ag/w_confirm_agm"],
  contextSizeChars: 100,
  estimatedTokens: 25,
  imageCount: 0,
};

describe("SaveDiagnosisUseCase", () => {
  it("persiste o diagnóstico com id e createdAt gerados", async () => {
    const repo = new JsonDiagnosisRepository();
    const useCase = new SaveDiagnosisUseCase(repo);

    const saved = await useCase.execute(SAVE_INPUT);

    expect(saved.id).toBeTruthy();
    expect(saved.resolvedTicketId).toBeNull();
    expect(saved.techLeadComment).toBeNull();
    expect(await repo.get(saved.id)).toEqual(saved);
  });

  it("persiste o comentário do tech lead quando fornecido", async () => {
    const repo = new JsonDiagnosisRepository();
    const useCase = new SaveDiagnosisUseCase(repo);

    const saved = await useCase.execute({ ...SAVE_INPUT, techLeadComment: "checar o evento ue_zoom primeiro" });

    expect(saved.techLeadComment).toBe("checar o evento ue_zoom primeiro");
  });
});

describe("MarkDiagnosisResolvedUseCase", () => {
  it("cria o ticket + link e marca o diagnóstico como resolvido", async () => {
    const diagnosisRepo = new JsonDiagnosisRepository();
    const saved = await new SaveDiagnosisUseCase(diagnosisRepo).execute({
      ...SAVE_INPUT,
      event: { owner: "dw_agm18tab", name: "zoom" },
    });

    const ticketRepo = new JsonTicketRepository();
    const objectRepo = new FakeObjectRepository([makeObject()]);
    const addTicket = new AddTicketUseCase(ticketRepo, new FakeEmbeddingProvider());
    const linkTicket = new LinkTicketToObjectUseCase(ticketRepo, objectRepo);
    const useCase = new MarkDiagnosisResolvedUseCase(diagnosisRepo, addTicket, linkTicket);

    const { ticket, link } = await useCase.execute({ diagnosisId: saved.id, externalId: "SMART-1" });

    expect(ticket.externalId).toBe("SMART-1");
    expect(ticket.descriptionRaw).toBe("chamado de teste");
    expect(ticket.resolutionText).toBe("Causa raiz: fake");
    expect(link.objectId).toBe("ag/ag/w_confirm_agm");
    expect(link.event).toEqual({ owner: "dw_agm18tab", name: "zoom" });

    const updated = await diagnosisRepo.get(saved.id);
    expect(updated?.resolvedTicketId).toBe(ticket.id);
  });

  it("rejeita diagnóstico inexistente", async () => {
    const diagnosisRepo = new JsonDiagnosisRepository();
    const ticketRepo = new JsonTicketRepository();
    const useCase = new MarkDiagnosisResolvedUseCase(
      diagnosisRepo,
      new AddTicketUseCase(ticketRepo, new FakeEmbeddingProvider()),
      new LinkTicketToObjectUseCase(ticketRepo, new FakeObjectRepository([])),
    );
    await expect(useCase.execute({ diagnosisId: "não-existe", externalId: "SMART-1" })).rejects.toThrow(/não encontrado/);
  });

  it("rejeita marcar como resolvido duas vezes", async () => {
    const diagnosisRepo = new JsonDiagnosisRepository();
    const saved = await new SaveDiagnosisUseCase(diagnosisRepo).execute(SAVE_INPUT);
    const ticketRepo = new JsonTicketRepository();
    const objectRepo = new FakeObjectRepository([makeObject()]);
    const useCase = new MarkDiagnosisResolvedUseCase(
      diagnosisRepo,
      new AddTicketUseCase(ticketRepo, new FakeEmbeddingProvider()),
      new LinkTicketToObjectUseCase(ticketRepo, objectRepo),
    );
    await useCase.execute({ diagnosisId: saved.id, externalId: "SMART-1" });
    await expect(useCase.execute({ diagnosisId: saved.id, externalId: "SMART-2" })).rejects.toThrow(/já marcado como solucionado/);
  });
});
