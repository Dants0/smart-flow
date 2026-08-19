import { describe, expect, it } from "vitest";
import type { IEmbeddingProvider } from "../../src/application/ports/embedding-provider.port.js";
import type { IObjectRepository } from "../../src/application/ports/object-repository.port.js";
import { AddTicketUseCase } from "../../src/application/use-cases/tickets/add-ticket.use-case.js";
import { FindSimilarTicketsUseCase } from "../../src/application/use-cases/tickets/find-similar-tickets.use-case.js";
import { LinkTicketToObjectUseCase } from "../../src/application/use-cases/tickets/link-ticket.use-case.js";
import type { PBObject } from "../../src/domain/entities/pb-object.js";
import { JsonTicketRepository } from "../../src/infrastructure/persistence/json-ticket-repository.js";

class FakeEmbeddingProvider implements IEmbeddingProvider {
  public calls: string[] = [];
  async embed(text: string): Promise<number[]> {
    this.calls.push(text);
    return [text.length, 1];
  }
}

function makeObject(overrides: Partial<PBObject> = {}): PBObject {
  return {
    id: "ag/ag/w_confirm_agm",
    type: "Window",
    name: "w_confirm_agm",
    ancestor: "w_sheet_gen",
    library: "ag/ag",
    filePath: "ag/ag.pbl.src/w_confirm_agm.srw",
    contentHash: "hash",
    structured: {
      events: [{ kind: "event", owner: "dw_agm18tab", name: "zoom", body: "...", startLine: 1, endLine: 5 }],
    },
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

describe("AddTicketUseCase", () => {
  it("cadastra um ticket novo com embedding calculado sobre título+descrição+resolução", async () => {
    const repo = new JsonTicketRepository();
    const embeddings = new FakeEmbeddingProvider();
    const useCase = new AddTicketUseCase(repo, embeddings);

    const ticket = await useCase.execute({
      externalId: "SMART-1",
      title: "Título",
      descriptionRaw: "Descrição",
      resolutionText: "Resolução",
      resolvedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(ticket.externalId).toBe("SMART-1");
    expect(embeddings.calls[0]).toBe("Título\n\nDescrição\n\nResolução");
    expect(await repo.findByExternalId("SMART-1")).toEqual(ticket);
  });

  it("rejeita externalId duplicado", async () => {
    const repo = new JsonTicketRepository();
    const useCase = new AddTicketUseCase(repo, new FakeEmbeddingProvider());
    const input = {
      externalId: "SMART-1",
      title: "t",
      descriptionRaw: "d",
      resolutionText: "r",
      resolvedAt: "2026-01-01T00:00:00.000Z",
    };
    await useCase.execute(input);
    await expect(useCase.execute(input)).rejects.toThrow(/já cadastrado/);
  });
});

describe("LinkTicketToObjectUseCase", () => {
  it("cria o link quando ticket e objeto existem", async () => {
    const ticketRepo = new JsonTicketRepository();
    const useCase = new AddTicketUseCase(ticketRepo, new FakeEmbeddingProvider());
    const ticket = await useCase.execute({
      externalId: "SMART-1",
      title: "t",
      descriptionRaw: "d",
      resolutionText: "r",
      resolvedAt: "2026-01-01T00:00:00.000Z",
    });

    const objectRepo = new FakeObjectRepository([makeObject()]);
    const linkUseCase = new LinkTicketToObjectUseCase(ticketRepo, objectRepo);
    const { link, ambiguities } = await linkUseCase.execute({
      ticketRef: "SMART-1", // via externalId
      objectName: "w_confirm_agm",
      event: { owner: "dw_agm18tab", name: "zoom" },
    });

    expect(link.ticketId).toBe(ticket.id);
    expect(link.objectId).toBe("ag/ag/w_confirm_agm");
    expect(link.confidence).toBe("confirmed");
    expect(ambiguities).toEqual([]);
    expect(await ticketRepo.linksForTicket(ticket.id)).toEqual([link]);
  });

  it("rejeita ticket inexistente", async () => {
    const useCase = new LinkTicketToObjectUseCase(new JsonTicketRepository(), new FakeObjectRepository([makeObject()]));
    await expect(useCase.execute({ ticketRef: "não-existe", objectName: "w_confirm_agm" })).rejects.toThrow(/não encontrado/);
  });

  it("rejeita objeto inexistente", async () => {
    const ticketRepo = new JsonTicketRepository();
    await new AddTicketUseCase(ticketRepo, new FakeEmbeddingProvider()).execute({
      externalId: "SMART-1",
      title: "t",
      descriptionRaw: "d",
      resolutionText: "r",
      resolvedAt: "2026-01-01T00:00:00.000Z",
    });
    const useCase = new LinkTicketToObjectUseCase(ticketRepo, new FakeObjectRepository([]));
    await expect(useCase.execute({ ticketRef: "SMART-1", objectName: "não_existe" })).rejects.toThrow(/não encontrado no grafo/);
  });

  it("rejeita evento inexistente no objeto", async () => {
    const ticketRepo = new JsonTicketRepository();
    await new AddTicketUseCase(ticketRepo, new FakeEmbeddingProvider()).execute({
      externalId: "SMART-1",
      title: "t",
      descriptionRaw: "d",
      resolutionText: "r",
      resolvedAt: "2026-01-01T00:00:00.000Z",
    });
    const useCase = new LinkTicketToObjectUseCase(ticketRepo, new FakeObjectRepository([makeObject()]));
    await expect(
      useCase.execute({ ticketRef: "SMART-1", objectName: "w_confirm_agm", event: { owner: "x", name: "clicked" } }),
    ).rejects.toThrow(/Evento "clicked"/);
  });

  it("reporta ambiguidade quando o nome do objeto colide entre PBLs", async () => {
    const ticketRepo = new JsonTicketRepository();
    await new AddTicketUseCase(ticketRepo, new FakeEmbeddingProvider()).execute({
      externalId: "SMART-1",
      title: "t",
      descriptionRaw: "d",
      resolutionText: "r",
      resolvedAt: "2026-01-01T00:00:00.000Z",
    });
    const dup1 = makeObject({ id: "lib1/w_x", library: "lib1" });
    const dup2 = makeObject({ id: "lib2/w_x", library: "lib2" });
    const useCase = new LinkTicketToObjectUseCase(ticketRepo, new FakeObjectRepository([dup1, dup2]));
    const { ambiguities } = await useCase.execute({ ticketRef: "SMART-1", objectName: "w_confirm_agm" });
    expect(ambiguities).toHaveLength(1);
  });
});

describe("FindSimilarTicketsUseCase", () => {
  it("retorna tickets ranqueados com seus links anexados", async () => {
    const ticketRepo = new JsonTicketRepository();
    const embeddings = new FakeEmbeddingProvider();
    const addUseCase = new AddTicketUseCase(ticketRepo, embeddings);
    const t1 = await addUseCase.execute({
      externalId: "SMART-1",
      title: "aaa",
      descriptionRaw: "d",
      resolutionText: "r",
      resolvedAt: "2026-01-01T00:00:00.000Z",
    });
    await ticketRepo.addLink({
      id: "l1",
      ticketId: t1.id,
      objectId: "ag/ag/w_confirm_agm",
      event: null,
      confidence: "confirmed",
      notes: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const useCase = new FindSimilarTicketsUseCase(ticketRepo, embeddings);
    const results = await useCase.execute("texto de busca", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.ticket.id).toBe(t1.id);
    expect(results[0]!.links).toHaveLength(1);
  });
});
