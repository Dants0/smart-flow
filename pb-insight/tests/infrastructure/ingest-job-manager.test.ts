import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IngestJobManager, type SpawnFn } from "../../src/infrastructure/ingest/ingest-job-manager.js";

/** Fake mínimo de ChildProcess: EventEmitter + .stderr, o suficiente para o que IngestJobManager usa. */
function fakeChildProcess(): { child: ChildProcess; stderr: EventEmitter } {
  const child = new EventEmitter() as unknown as ChildProcess;
  const stderr = new EventEmitter();
  (child as unknown as { stderr: EventEmitter }).stderr = stderr;
  return { child, stderr };
}

/** Fábrica de spawnFn fake — cada chamada de start() recebe um child novo, como o spawn real faria. */
function fakeSpawnFactory(): {
  spawnFn: SpawnFn;
  children: Array<{ child: ChildProcess; stderr: EventEmitter }>;
  calls: Array<{ command: string; args: readonly string[] }>;
} {
  const children: Array<{ child: ChildProcess; stderr: EventEmitter }> = [];
  const calls: Array<{ command: string; args: readonly string[] }> = [];
  const spawnFn = ((command: string, args: readonly string[]) => {
    calls.push({ command, args });
    const created = fakeChildProcess();
    children.push(created);
    return created.child;
  }) as SpawnFn;
  return { spawnFn, children, calls };
}

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "pb-insight-ingest-job-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("IngestJobManager", () => {
  it("estado inicial é idle", () => {
    const { spawnFn } = fakeSpawnFactory();
    const manager = new IngestJobManager(spawnFn);
    expect(manager.getState()).toEqual({ status: "idle" });
  });

  it("conclusão com sucesso lê o relatório e chama onDone", async () => {
    const { spawnFn, children } = fakeSpawnFactory();
    const manager = new IngestJobManager(spawnFn);

    const reportPath = join(workDir, "report.json");
    const graphPath = join(workDir, "graph.json");
    let onDoneReport: unknown;

    const state = manager.start({
      rootDir: "raiz-fake",
      label: "teste",
      graphPath,
      reportPath,
      onDone: (report) => {
        onDoneReport = report;
      },
    });
    expect(state?.status).toBe("running");

    writeFileSync(
      reportPath,
      JSON.stringify({ label: "teste", versionId: "v1", objectCount: 10, dependencyCount: 5, skippedCount: 0, durationMs: 100 }),
      "utf-8",
    );
    children[0]!.child.emit("close", 0);
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

    const finalState = manager.getState();
    expect(finalState.status).toBe("done");
    expect(finalState.report?.objectCount).toBe(10);
    expect(onDoneReport).toEqual(finalState.report);
  });

  it("saída com código diferente de zero vira estado 'error' com o stderr capturado", () => {
    const { spawnFn, children } = fakeSpawnFactory();
    const manager = new IngestJobManager(spawnFn);

    manager.start({ rootDir: "x", graphPath: join(workDir, "g.json"), reportPath: join(workDir, "r.json") });
    children[0]!.stderr.emit("data", Buffer.from("deu erro no parser"));
    children[0]!.child.emit("close", 1);

    const state = manager.getState();
    expect(state.status).toBe("error");
    expect(state.error).toContain("deu erro no parser");
  });

  it("evento 'error' do processo filho também vira estado 'error'", () => {
    const { spawnFn, children } = fakeSpawnFactory();
    const manager = new IngestJobManager(spawnFn);

    manager.start({ rootDir: "x", graphPath: join(workDir, "g.json"), reportPath: join(workDir, "r.json") });
    children[0]!.child.emit("error", new Error("ENOENT: npx não encontrado"));

    const state = manager.getState();
    expect(state.status).toBe("error");
    expect(state.error).toContain("npx não encontrado");
  });

  it("start() retorna null quando já existe uma ingestão em andamento", () => {
    const { spawnFn } = fakeSpawnFactory();
    const manager = new IngestJobManager(spawnFn);

    const first = manager.start({ rootDir: "x", graphPath: join(workDir, "g.json"), reportPath: join(workDir, "r.json") });
    expect(first).not.toBeNull();

    const second = manager.start({ rootDir: "x", graphPath: join(workDir, "g.json"), reportPath: join(workDir, "r.json") });
    expect(second).toBeNull();
  });

  it("cita (aspas) argumentos com espaço — ws_objects real vive em 'C:\\controle de versão\\...'", () => {
    const { spawnFn, calls } = fakeSpawnFactory();
    const manager = new IngestJobManager(spawnFn);

    manager.start({
      rootDir: "C:\\controle de versão\\smart_desktop\\ws_objects",
      label: "com espaço também",
      graphPath: "C:\\semespaco\\graph.json", // sem espaço — não deve ganhar aspas
      reportPath: "C:\\semespaco\\report.json",
    });

    const args = calls[0]!.args;
    expect(args).toContain('"C:\\controle de versão\\smart_desktop\\ws_objects"');
    expect(args).toContain('"com espaço também"');
    expect(args).toContain("C:\\semespaco\\graph.json"); // sem aspas, não tem espaço
  });

  it("após concluir, a mesma instância aceita um novo start()", () => {
    const { spawnFn, children } = fakeSpawnFactory();
    const manager = new IngestJobManager(spawnFn);
    const reportPath = join(workDir, "r.json");

    manager.start({ rootDir: "x", graphPath: join(workDir, "g.json"), reportPath });
    writeFileSync(
      reportPath,
      JSON.stringify({ label: "x", versionId: "v1", objectCount: 1, dependencyCount: 0, skippedCount: 0, durationMs: 1 }),
      "utf-8",
    );
    children[0]!.child.emit("close", 0);

    const result = manager.start({ rootDir: "x", graphPath: join(workDir, "g.json"), reportPath });
    expect(result?.status).toBe("running");
    expect(children).toHaveLength(2); // um child por start()
  });
});
