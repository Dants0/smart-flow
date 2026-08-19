import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Ticket, TicketObjectLink } from "../../src/domain/entities/ticket.js";
import { JsonTicketRepository } from "../../src/infrastructure/persistence/json-ticket-repository.js";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "pb-insight-tickets-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: crypto.randomUUID(),
    externalId: "SMART-1",
    title: "t",
    descriptionRaw: "d",
    resolutionText: "r",
    module: null,
    versionAffected: null,
    resolvedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("JsonTicketRepository", () => {
  it("persiste tickets e sobrevive a reload a partir do disco", async () => {
    const path = join(workDir, "tickets.json");
    const repo = new JsonTicketRepository(path);
    const ticket = makeTicket();
    await repo.addTicket(ticket, [1, 0]);

    const reloaded = JsonTicketRepository.load(path);
    expect(await reloaded.getTicket(ticket.id)).toEqual(ticket);
    expect(await reloaded.findByExternalId("smart-1")).toEqual(ticket); // case-insensitive
  });

  it("allTickets retorna todos os cadastrados", async () => {
    const repo = new JsonTicketRepository();
    await repo.addTicket(makeTicket({ id: "a", externalId: "SMART-1" }), [1, 0]);
    await repo.addTicket(makeTicket({ id: "b", externalId: "SMART-2" }), [0, 1]);
    expect((await repo.allTickets()).map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("links: addLink, linksForTicket, linksForObject", async () => {
    const repo = new JsonTicketRepository();
    const link: TicketObjectLink = {
      id: "l1",
      ticketId: "t1",
      objectId: "ag/ag/w_confirm_agm",
      event: null,
      confidence: "confirmed",
      notes: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    await repo.addLink(link);
    expect(await repo.linksForTicket("t1")).toEqual([link]);
    expect(await repo.linksForObject("ag/ag/w_confirm_agm")).toEqual([link]);
    expect(await repo.linksForTicket("outro")).toEqual([]);
  });

  it("findSimilar ranqueia por similaridade de cosseno, mais próximo primeiro", async () => {
    const repo = new JsonTicketRepository();
    const close = makeTicket({ id: "close", externalId: "SMART-CLOSE" });
    const far = makeTicket({ id: "far", externalId: "SMART-FAR" });
    const opposite = makeTicket({ id: "opposite", externalId: "SMART-OPP" });
    await repo.addTicket(far, [0, 1]);
    await repo.addTicket(close, [0.9, 0.1]);
    await repo.addTicket(opposite, [-1, 0]);

    const results = await repo.findSimilar([1, 0], 3);
    expect(results.map((r) => r.ticket.id)).toEqual(["close", "far", "opposite"]);
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    expect(results[2]!.score).toBeLessThan(0); // vetor oposto -> similaridade negativa
  });

  it("deleteTicket remove o ticket e, em cascata, seus links", async () => {
    const repo = new JsonTicketRepository();
    const ticket = makeTicket({ id: "t1" });
    await repo.addTicket(ticket, [1, 0]);
    await repo.addLink({
      id: "l1",
      ticketId: "t1",
      objectId: "ag/ag/w_confirm_agm",
      event: null,
      confidence: "confirmed",
      notes: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(await repo.deleteTicket("t1")).toBe(true);
    expect(await repo.getTicket("t1")).toBeNull();
    expect(await repo.linksForTicket("t1")).toEqual([]);
  });

  it("deleteTicket retorna false para id inexistente e não mexe em nada", async () => {
    const repo = new JsonTicketRepository();
    await repo.addTicket(makeTicket({ id: "t1" }), [1, 0]);
    expect(await repo.deleteTicket("não-existe")).toBe(false);
    expect(await repo.getTicket("t1")).not.toBeNull();
  });

  it("deleteTicket sobrevive a reload — ticket e links apagados não reaparecem", async () => {
    const path = join(workDir, "tickets.json");
    const repo = new JsonTicketRepository(path);
    await repo.addTicket(makeTicket({ id: "t1" }), [1, 0]);
    await repo.addLink({
      id: "l1",
      ticketId: "t1",
      objectId: "ag/ag/w_confirm_agm",
      event: null,
      confidence: "confirmed",
      notes: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    await repo.deleteTicket("t1");

    const reloaded = JsonTicketRepository.load(path);
    expect(await reloaded.getTicket("t1")).toBeNull();
    expect(await reloaded.linksForTicket("t1")).toEqual([]);
  });

  it("findSimilar respeita o limit", async () => {
    const repo = new JsonTicketRepository();
    for (let i = 0; i < 5; i++) {
      await repo.addTicket(makeTicket({ id: `t${i}`, externalId: `SMART-${i}` }), [i, 1]);
    }
    expect(await repo.findSimilar([1, 1], 2)).toHaveLength(2);
  });
});
