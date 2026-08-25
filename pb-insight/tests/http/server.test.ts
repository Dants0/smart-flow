import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  DiagnosisOutput,
  DiagnosticContext,
  ILLMClient,
} from "../../src/application/ports/llm-client.port.js";
import type { ISourceFileProvider, SourceFile } from "../../src/application/ports/source-file-provider.port.js";
import { IngestCodebaseVersionUseCase } from "../../src/application/use-cases/ingest-codebase-version/ingest-codebase-version.use-case.js";
import type {
  IIngestJobManager,
  IngestJobState,
  StartIngestOptions,
} from "../../src/infrastructure/ingest/ingest-job-manager.js";
import type { IEmbeddingProvider } from "../../src/application/ports/embedding-provider.port.js";
import { HeuristicDependencyExtractor } from "../../src/infrastructure/parsers/heuristic-dependency-extractor.js";
import { ParserRegistry } from "../../src/infrastructure/parsers/parser-registry.js";
import { JsonDiagnosisRepository } from "../../src/infrastructure/persistence/json-diagnosis-repository.js";
import { JsonObjectRepository } from "../../src/infrastructure/persistence/json-object-repository.js";
import { JsonTicketRepository } from "../../src/infrastructure/persistence/json-ticket-repository.js";
import { InMemorySearchIndex } from "../../src/infrastructure/search/in-memory-search-index.js";
import type { AppContext } from "../../src/interfaces/http/app-context.js";
import { buildServer } from "../../src/interfaces/http/build-server.js";

/**
 * Fake dedicado ao teste de WIRING da rota (start() é chamado com os
 * argumentos certos, 202/409 corretos) — o ciclo de vida real do processo
 * filho é responsabilidade do IngestJobManager e é testado à parte em
 * tests/infrastructure/ingest-job-manager.test.ts.
 */
class FakeIngestJobManager implements IIngestJobManager {
  public startCalls: StartIngestOptions[] = [];
  public nextStartResult: IngestJobState | null = { status: "running", startedAt: "2026-01-01T00:00:00.000Z" };
  private currentState: IngestJobState = { status: "idle" };

  start(options: StartIngestOptions): IngestJobState | null {
    this.startCalls.push(options);
    if (this.nextStartResult) this.currentState = this.nextStartResult;
    return this.nextStartResult;
  }

  getState(): IngestJobState {
    return this.currentState;
  }

  setState(state: IngestJobState): void {
    this.currentState = state;
  }
}

class FakeProvider implements ISourceFileProvider {
  constructor(private readonly files: SourceFile[]) {}
  async readAll(): Promise<SourceFile[]> {
    return this.files;
  }
  async readOne(path: string): Promise<string> {
    const f = this.files.find((x) => x.relativePath === path);
    if (!f) throw new Error(`não encontrado: ${path}`);
    return f.content;
  }
}

/** Embedding determinístico (sem rede) — só precisa ser consistente para o teste de /tickets/similar. */
class FakeEmbeddingProvider implements IEmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const seed = [...text].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return [Math.sin(seed), Math.cos(seed)];
  }
}

class FakeLLMClient implements ILLMClient {
  public lastContext: DiagnosticContext | undefined;
  async synthesizeDiagnosis(context: DiagnosticContext): Promise<DiagnosisOutput> {
    this.lastContext = context;
    return {
      text: "Causa raiz: fake",
      model: "fake-model",
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  }
}

const FILES: SourceFile[] = [
  {
    relativePath: "gen/gen.pbl.src/w_sheet_gen.srw",
    content: `$PBExportHeader$w_sheet_gen.srw\nglobal type w_sheet_gen from window\nend type`,
  },
  {
    relativePath: "gen/gen.pbl.src/u_datawindow_padrao.sru",
    content: `$PBExportHeader$u_datawindow_padrao.sru\nglobal type u_datawindow_padrao from datawindow\nend type`,
  },
  {
    relativePath: "ag/ag.pbl.src/d_agm18tab_conf.srd",
    content: `$PBExportHeader$d_agm18tab_conf.srd\nrelease 12.5;\ntable(column=(type=char(1) name=agm_pac dbname="agm.agm_pac" values="Segunda~t2" )\n retrieve="SELECT agm_pac FROM agm" )\ntext(band=header text="Período" name=agm_pac_t )`,
  },
  {
    relativePath: "ag/ag.pbl.src/w_confirm_agm.srw",
    content: [
      "$PBExportHeader$w_confirm_agm.srw",
      "global type w_confirm_agm from w_sheet_gen",
      "end type",
      "type dw_agm18tab from u_datawindow_padrao within w_confirm_agm",
      'string dataobject = "d_agm18tab_conf"',
      "end type",
      "event zoom;call super::zoom;LONG nSelRow",
      "This.GroupCalc()",
      "This.ScrollToRow ( nSelRow )",
      "end event",
    ].join("\n"),
  },
  {
    // Irmã de w_confirm_agm: mesmo evento, mesmo tipo de controle, NENHUMA
    // aresta entre as duas. Só aparece via /siblings (docs/16).
    relativePath: "ag/ag.pbl.src/w_irma_agm.srw",
    content: [
      "$PBExportHeader$w_irma_agm.srw",
      "global type w_irma_agm from w_sheet_gen",
      "end type",
      "type dw_agm18tab from u_datawindow_padrao within w_irma_agm",
      "end type",
      "event zoom;call super::zoom;CORPO_DA_IRMA_AGM",
      "end event",
    ].join("\n"),
  },
];

let app: FastifyInstance;
let llm: FakeLLMClient;
let snapshotsDir: string;
let workDir: string;
let context: AppContext;
let fakeIngestJobManager: FakeIngestJobManager;

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "pb-insight-http-"));
  const graphPath = join(workDir, "graph.json");

  // storagePath real (não só em memória) — necessário pro teste de /reload,
  // que precisa reler o arquivo do disco de verdade.
  const repository = new JsonObjectRepository(graphPath);
  await new IngestCodebaseVersionUseCase(
    new FakeProvider(FILES),
    new ParserRegistry(),
    new HeuristicDependencyExtractor(),
    repository,
  ).execute("teste-http");

  const searchIndex = new InMemorySearchIndex(await repository.allObjects());
  llm = new FakeLLMClient();
  fakeIngestJobManager = new FakeIngestJobManager();

  snapshotsDir = mkdtempSync(join(tmpdir(), "pb-insight-snapshots-"));
  const version = await repository.getVersion();
  const olderSnapshot = {
    version: { ...version!, id: "old-version", label: "antiga" },
    objects: (await repository.allObjects()).filter((o) => o.name !== "w_confirm_agm"), // simula objeto ainda não existente
    dependencies: [],
  };
  writeFileSync(join(snapshotsDir, "antiga.json"), JSON.stringify(olderSnapshot), "utf-8");

  context = {
    repository,
    searchIndex,
    sourceFiles: new FakeProvider(FILES),
    createLLMClient: () => llm, // ignora provider/model em teste — sempre o fake, sem rede
    graphPath,
    snapshotsDir,
    wsObjectsRoot: "raiz-fake-em-teste",
    ingestReportPath: join(workDir, "last-ingest-report.json"),
    ingestJobs: fakeIngestJobManager,
    ticketRepository: new JsonTicketRepository(join(workDir, "tickets.json")),
    embeddings: new FakeEmbeddingProvider(),
    diagnosisRepository: new JsonDiagnosisRepository(join(workDir, "diagnoses.json")),
  };

  app = await buildServer(context, { logger: false });
});

afterAll(async () => {
  await app.close();
  rmSync(snapshotsDir, { recursive: true, force: true });
  rmSync(workDir, { recursive: true, force: true });
});

describe("GET /health", () => {
  it("reporta status ok e a versão carregada", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.version.label).toBe("teste-http");
  });
});

describe("GET /search", () => {
  it("encontra por texto de UI (code table) e por código", async () => {
    const uiRes = await app.inject({ method: "GET", url: "/search?q=Per%C3%ADodo" });
    expect(uiRes.statusCode).toBe(200);
    expect(uiRes.json().matches.some((m: { kind: string }) => m.kind === "ui_string")).toBe(true);

    const codeRes = await app.inject({ method: "GET", url: "/search?q=ScrollToRow" });
    const codeMatch = codeRes.json().matches.find((m: { kind: string }) => m.kind === "event");
    expect(codeMatch).toBeDefined();
    expect(codeMatch.event.owner).toBe("dw_agm18tab");
    expect(codeMatch.event.name).toBe("zoom");
  });

  it("400 quando falta o parâmetro obrigatório q", async () => {
    const res = await app.inject({ method: "GET", url: "/search" });
    expect(res.statusCode).toBe(400);
  });

  it("filtra por types — 'Período' só existe em d_agm18tab_conf (DataWindow)", async () => {
    const dwRes = await app.inject({ method: "GET", url: "/search?q=Per%C3%ADodo&types=DataWindow" });
    expect(dwRes.statusCode).toBe(200);
    expect(dwRes.json().matches.length).toBeGreaterThan(0);
    expect(dwRes.json().matches.every((m: { object: { type: string } }) => m.object.type === "DataWindow")).toBe(true);

    const windowRes = await app.inject({ method: "GET", url: "/search?q=Per%C3%ADodo&types=Window" });
    expect(windowRes.statusCode).toBe(200);
    expect(windowRes.json().matches).toEqual([]);
  });

  it("400 quando types tem um tipo inválido", async () => {
    const res = await app.inject({ method: "GET", url: "/search?q=x&types=Window,NaoExiste" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("NaoExiste");
  });
});

describe("GET /objects/:name", () => {
  it("retorna o objeto completo, incluindo eventos extraídos", async () => {
    const res = await app.inject({ method: "GET", url: "/objects/w_confirm_agm" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(1);
    expect(body.objects[0].structured.events.some((e: { name: string }) => e.name === "zoom")).toBe(true);
  });

  it("404 para objeto inexistente", async () => {
    const res = await app.inject({ method: "GET", url: "/objects/w_nao_existe" });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /objects/:name/context", () => {
  it("retorna ancestrais e relacionados resumidos", async () => {
    const res = await app.inject({ method: "GET", url: "/objects/w_confirm_agm/context?hops=1" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.root.name).toBe("w_confirm_agm");
    expect(body.ancestors.map((a: { name: string }) => a.name)).toContain("w_sheet_gen");
    expect(body.related.map((r: { object: { name: string } }) => r.object.name)).toContain("d_agm18tab_conf");
  });
});

describe("GET /objects/:name/events/:eventName", () => {
  it("acha o evento e retorna o corpo", async () => {
    const res = await app.inject({ method: "GET", url: "/objects/w_confirm_agm/events/zoom?owner=dw_agm18tab" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.matches[0].event.body).toContain("GroupCalc");
  });

  it("404 quando o evento não existe", async () => {
    const res = await app.inject({ method: "GET", url: "/objects/w_confirm_agm/events/inexistente" });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /snapshots e /diff", () => {
  it("lista o snapshot escrito no diretório de teste", async () => {
    const res = await app.inject({ method: "GET", url: "/snapshots" });
    expect(res.statusCode).toBe(200);
    expect(res.json().snapshots.map((s: { file: string }) => s.file)).toContain("antiga.json");
  });

  it("compara o snapshot antigo (sem w_confirm_agm) contra o grafo atual — detecta 'added'", async () => {
    const res = await app.inject({ method: "GET", url: "/diff?from=antiga.json" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.counts.added).toBeGreaterThan(0);
    expect(body.entries.some((e: { name: string }) => e.name === "w_confirm_agm")).toBe(true);
  });

  it("400 para nome de snapshot com tentativa de path traversal", async () => {
    const res = await app.inject({ method: "GET", url: "/diff?from=..%2F..%2Fetc" });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /diagnose", () => {
  it("dryRun=true não chama o LLM e reporta o tamanho do contexto", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/diagnose",
      payload: { objectName: "w_confirm_agm", ticketText: "chamado de teste", dryRun: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.dryRun).toBe(true);
    expect(body.diagnosis).toBeUndefined();
    expect(body.context.contextSizeChars).toBeGreaterThan(0);
  });

  it("com event/owner, foca no evento isolado e chama o FakeLLMClient", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/diagnose",
      payload: {
        objectName: "w_confirm_agm",
        ticketText: "chamado real de teste",
        relations: "none",
        event: { owner: "dw_agm18tab", name: "zoom" },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.context.focusedOnEvent).toBe(true);
    expect(body.diagnosis.text).toBe("Causa raiz: fake");
    expect(llm.lastContext?.ticketText).toBe("chamado real de teste");
    expect(llm.lastContext?.objectContext).toContain("GroupCalc");
  });

  it("repassa imagens de evidência válidas ao ILLMClient e reporta imageCount no dry-run", async () => {
    const images = [{ mediaType: "image/png", base64Data: "ZmFrZQ==" }];

    const dryRunRes = await app.inject({
      method: "POST",
      url: "/diagnose",
      payload: { objectName: "w_confirm_agm", ticketText: "chamado", dryRun: true, images },
    });
    expect(dryRunRes.statusCode).toBe(200);
    expect(dryRunRes.json().context.imageCount).toBe(1);

    const realRes = await app.inject({
      method: "POST",
      url: "/diagnose",
      payload: { objectName: "w_confirm_agm", ticketText: "chamado", images },
    });
    expect(realRes.statusCode).toBe(200);
    expect(llm.lastContext?.images).toEqual(images);
  });

  it("400 quando a imagem tem mediaType não suportado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/diagnose",
      payload: {
        objectName: "w_confirm_agm",
        ticketText: "chamado",
        images: [{ mediaType: "image/bmp", base64Data: "x" }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("image/bmp");
  });

  it("404 quando o objeto não existe", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/diagnose",
      payload: { objectName: "w_nao_existe", ticketText: "x", dryRun: true },
    });
    expect(res.statusCode).toBe(404);
  });

  it("repassa o comentário do tech lead ao ILLMClient quando fornecido", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/diagnose",
      payload: {
        objectName: "w_confirm_agm",
        ticketText: "chamado",
        techLeadComment: "acho que é o GroupCalc do evento zoom",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(llm.lastContext?.techLeadComment).toBe("acho que é o GroupCalc do evento zoom");
  });
});

describe("POST /ingest e GET /ingest/status", () => {
  it("202 e repassa rootDir/label/graphPath/reportPath pro job manager", async () => {
    fakeIngestJobManager.nextStartResult = { status: "running", startedAt: "2026-01-01T00:00:00.000Z" };

    const res = await app.inject({ method: "POST", url: "/ingest", payload: { label: "teste-manual" } });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe("running");

    const call = fakeIngestJobManager.startCalls.at(-1);
    expect(call?.label).toBe("teste-manual");
    expect(call?.rootDir).toBe(context.wsObjectsRoot);
    expect(call?.graphPath).toBe(context.graphPath);
    expect(call?.reportPath).toBe(context.ingestReportPath);
  });

  it("409 quando já existe uma ingestão em andamento", async () => {
    fakeIngestJobManager.nextStartResult = null;
    const res = await app.inject({ method: "POST", url: "/ingest" });
    expect(res.statusCode).toBe(409);
  });

  it("GET /ingest/status reflete o estado atual do job manager", async () => {
    fakeIngestJobManager.setState({
      status: "done",
      startedAt: "t0",
      finishedAt: "t1",
      report: { label: "x", versionId: "v1", objectCount: 3, dependencyCount: 1, skippedCount: 0, durationMs: 10 },
    });
    const res = await app.inject({ method: "GET", url: "/ingest/status" });
    expect(res.statusCode).toBe(200);
    expect(res.json().report.objectCount).toBe(3);
  });
});

describe("POST /reload", () => {
  it("recarrega o grafo em memória a partir do graph.json no disco, sem reiniciar o servidor", async () => {
    const before = await app.inject({ method: "GET", url: "/objects/w_confirm_agm" });
    expect(before.statusCode).toBe(200);

    const originalContent = readFileSync(context.graphPath, "utf-8");
    const modified = JSON.parse(originalContent) as { objects: Array<{ name: string }> };
    modified.objects = modified.objects.filter((o) => o.name !== "w_confirm_agm");
    writeFileSync(context.graphPath, JSON.stringify(modified), "utf-8");

    const reloadRes = await app.inject({ method: "POST", url: "/reload" });
    expect(reloadRes.statusCode).toBe(200);
    expect(reloadRes.json().status).toBe("ok");

    const after = await app.inject({ method: "GET", url: "/objects/w_confirm_agm" });
    expect(after.statusCode).toBe(404); // reload pegou o grafo modificado, sem w_confirm_agm

    // restaura para não afetar a ordem de outros testes no arquivo
    writeFileSync(context.graphPath, originalContent, "utf-8");
    const restoreRes = await app.inject({ method: "POST", url: "/reload" });
    expect(restoreRes.statusCode).toBe(200);
  });
});

describe("POST /tickets, GET /tickets, POST /tickets/:id/links, GET /tickets/similar", () => {
  it("cadastra, rejeita duplicata, lista, linka a um objeto real e acha por similaridade", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/tickets",
      payload: {
        externalId: "SMART-99999",
        title: "Zoom não seleciona linha",
        descriptionRaw: "Usuário reporta zoom quebrado.",
        resolutionText: "Causa: ScrollToRow com nSelRow errado em dw_agm18tab.zoom.",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const ticket = createRes.json();
    expect(ticket.externalId).toBe("SMART-99999");

    const dupRes = await app.inject({ method: "POST", url: "/tickets", payload: { externalId: "SMART-99999", title: "x", descriptionRaw: "x", resolutionText: "x" } });
    expect(dupRes.statusCode).toBe(409);

    const listRes = await app.inject({ method: "GET", url: "/tickets" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().tickets.some((t: { externalId: string }) => t.externalId === "SMART-99999")).toBe(true);

    const getRes = await app.inject({ method: "GET", url: "/tickets/SMART-99999" });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().ticket.id).toBe(ticket.id);

    const linkRes = await app.inject({
      method: "POST",
      url: `/tickets/${ticket.id}/links`,
      payload: { objectName: "w_confirm_agm", event: { owner: "dw_agm18tab", name: "zoom" } },
    });
    expect(linkRes.statusCode).toBe(201);
    expect(linkRes.json().link.objectId).toBe("ag/ag/w_confirm_agm");

    const badObjectRes = await app.inject({
      method: "POST",
      url: `/tickets/${ticket.id}/links`,
      payload: { objectName: "objeto_que_nao_existe" },
    });
    expect(badObjectRes.statusCode).toBe(400);

    const similarRes = await app.inject({ method: "GET", url: "/tickets/similar?q=zoom%20quebrado" });
    expect(similarRes.statusCode).toBe(200);
    const body = similarRes.json();
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0].links[0].objectId).toBe("ag/ag/w_confirm_agm");
  });

  it("DELETE /tickets/:id apaga o ticket e seus links em cascata (aceita id ou externalId)", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/tickets",
      payload: {
        externalId: "SMART-88801",
        title: "x",
        descriptionRaw: "x",
        resolutionText: "x",
      },
    });
    const ticket = createRes.json();

    await app.inject({
      method: "POST",
      url: `/tickets/${ticket.id}/links`,
      payload: { objectName: "w_confirm_agm" },
    });

    const deleteRes = await app.inject({ method: "DELETE", url: "/tickets/SMART-88801" });
    expect(deleteRes.statusCode).toBe(204);

    const getRes = await app.inject({ method: "GET", url: `/tickets/${ticket.id}` });
    expect(getRes.statusCode).toBe(404);

    const listRes = await app.inject({ method: "GET", url: "/tickets" });
    expect(listRes.json().tickets.some((t: { id: string }) => t.id === ticket.id)).toBe(false);
  });

  it("DELETE /tickets/:id 404 para id inexistente", async () => {
    const res = await app.inject({ method: "DELETE", url: "/tickets/nao-existe" });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /diagnoses, GET /diagnoses, DELETE /diagnoses/:id, POST /diagnoses/:id/resolve", () => {
  it("salva, lista, detalha, resolve (cria ticket+link) e depois apaga", async () => {
    const saveRes = await app.inject({
      method: "POST",
      url: "/diagnoses",
      payload: {
        objectId: "ag/ag/w_confirm_agm",
        objectName: "w_confirm_agm",
        event: { owner: "dw_agm18tab", name: "zoom" },
        ticketText: "chamado de teste",
        diagnosisText: "Causa raiz: fake",
        provider: "claude",
        model: "claude-sonnet-5",
        dumpedObjectIds: ["ag/ag/w_confirm_agm"],
        contextSizeChars: 100,
        estimatedTokens: 25,
      },
    });
    expect(saveRes.statusCode).toBe(201);
    const saved = saveRes.json();
    expect(saved.resolvedTicketId).toBeNull();

    const listRes = await app.inject({ method: "GET", url: "/diagnoses" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().diagnoses.some((d: { id: string }) => d.id === saved.id)).toBe(true);

    const getRes = await app.inject({ method: "GET", url: `/diagnoses/${saved.id}` });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().diagnosisText).toBe("Causa raiz: fake");

    const resolveRes = await app.inject({
      method: "POST",
      url: `/diagnoses/${saved.id}/resolve`,
      payload: { externalId: "SMART-77777" },
    });
    expect(resolveRes.statusCode).toBe(201);
    const resolveBody = resolveRes.json();
    expect(resolveBody.ticket.externalId).toBe("SMART-77777");
    expect(resolveBody.link.objectId).toBe("ag/ag/w_confirm_agm");

    const doubleResolveRes = await app.inject({
      method: "POST",
      url: `/diagnoses/${saved.id}/resolve`,
      payload: { externalId: "SMART-88888" },
    });
    expect(doubleResolveRes.statusCode).toBe(400);

    const deleteRes = await app.inject({ method: "DELETE", url: `/diagnoses/${saved.id}` });
    expect(deleteRes.statusCode).toBe(204);

    const deleteAgainRes = await app.inject({ method: "DELETE", url: `/diagnoses/${saved.id}` });
    expect(deleteAgainRes.statusCode).toBe(404);
  });

  it("404 ao resolver diagnóstico inexistente", async () => {
    const res = await app.inject({ method: "POST", url: "/diagnoses/nao-existe/resolve", payload: { externalId: "X" } });
    expect(res.statusCode).toBe(404);
  });
});

describe("CORS preflight", () => {
  it("permite DELETE no preflight — sem isso o browser bloqueia apagar ticket/diagnóstico antes de sair (docs/14)", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/tickets/x",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "DELETE",
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-methods"]).toContain("DELETE");
  });
});

describe("GET /docs (Swagger UI)", () => {
  it("responde com a página de documentação", async () => {
    const res = await app.inject({ method: "GET", url: "/docs" });
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /objects/:name/events/:eventName/siblings", () => {
  it("acha a janela irmã que não tem nenhuma aresta com o objeto raiz", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/objects/w_confirm_agm/events/zoom/siblings?owner=dw_agm18tab",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.controlType).toBe("u_datawindow_padrao");
    expect(body.siblings.map((s: { object: { name: string } }) => s.object.name)).toEqual(["w_irma_agm"]);
    expect(body.siblings[0].event.body).toContain("CORPO_DA_IRMA_AGM");
  });

  it("não marca truncado quando a lista inteira cabe no limit", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/objects/w_confirm_agm/events/zoom/siblings?owner=dw_agm18tab&limit=1",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ count: 1, truncated: false });
  });

  it("404 quando o objeto raiz não existe", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/objects/w_inexistente/events/zoom/siblings?owner=dw_agm18tab",
    });
    expect(res.statusCode).toBe(404);
  });

  it("404 quando o controle não existe no objeto raiz", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/objects/w_confirm_agm/events/zoom/siblings?owner=dw_inexistente",
    });
    expect(res.statusCode).toBe(404);
  });

  it("400 quando owner não é informado", async () => {
    const res = await app.inject({ method: "GET", url: "/objects/w_confirm_agm/events/zoom/siblings" });
    expect(res.statusCode).toBe(400);
  });
});
