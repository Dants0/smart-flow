import { describe, expect, it } from "vitest";
import type {
  DiagnosisOutput,
  DiagnosticContext,
  ILLMClient,
} from "../../src/application/ports/llm-client.port.js";
import type {
  ISourceFileProvider,
  SourceFile,
} from "../../src/application/ports/source-file-provider.port.js";
import { DiagnoseTicketUseCase } from "../../src/application/use-cases/diagnose-ticket/diagnose-ticket.use-case.js";
import { IngestCodebaseVersionUseCase } from "../../src/application/use-cases/ingest-codebase-version/ingest-codebase-version.use-case.js";
import { HeuristicDependencyExtractor } from "../../src/infrastructure/parsers/heuristic-dependency-extractor.js";
import { ParserRegistry } from "../../src/infrastructure/parsers/parser-registry.js";
import { JsonObjectRepository } from "../../src/infrastructure/persistence/json-object-repository.js";

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

// Mesma topologia do teste de ingestão, com um alvo extra ("opens") para
// provar que a exclusão de navegação por padrão funciona.
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
    content: `$PBExportHeader$d_agm18tab_conf.srd\nrelease 12.5;\ntable(column=(type=char(1) name=agm_pac dbname="agm.agm_pac" )\n retrieve="SELECT agm_pac FROM agm" )`,
  },
  {
    relativePath: "ag/ag.pbl.src/w_x.srw",
    content: `$PBExportHeader$w_x.srw\nglobal type w_x from window\nend type`,
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
      "event ue_zoom;",
      "OpenWithParm(w_x, l_parm)",
      "end event",
    ].join("\n"),
  },
];

async function ingestFakeCodebase() {
  const repo = new JsonObjectRepository();
  await new IngestCodebaseVersionUseCase(
    new FakeProvider(FILES),
    new ParserRegistry(),
    new HeuristicDependencyExtractor(),
    repo,
  ).execute("teste");
  return repo;
}

describe("DiagnoseTicketUseCase.prepare", () => {
  it("inclui root, ancestral e embeds/references, mas exclui opens por padrão", async () => {
    const repo = await ingestFakeCodebase();
    const useCase = new DiagnoseTicketUseCase(repo, new FakeProvider(FILES), new FakeLLMClient());

    const prep = await useCase.prepare("w_confirm_agm");
    expect(prep).not.toBeNull();

    const names = prep!.dumpedObjects.map((o) => o.name);
    expect(names).toContain("w_confirm_agm");
    expect(names).toContain("w_sheet_gen");
    expect(names).toContain("u_datawindow_padrao");
    expect(names).toContain("d_agm18tab_conf");
    expect(names).not.toContain("w_x"); // opens — excluído por padrão
  });

  it("inclui 'opens' quando explicitamente pedido via relationTypes", async () => {
    const repo = await ingestFakeCodebase();
    const useCase = new DiagnoseTicketUseCase(repo, new FakeProvider(FILES), new FakeLLMClient());

    const prep = await useCase.prepare("w_confirm_agm", 1, ["embeds", "references", "opens"]);
    expect(prep!.dumpedObjects.map((o) => o.name)).toContain("w_x");
  });

  it("retorna null quando o objeto não existe no grafo", async () => {
    const repo = await ingestFakeCodebase();
    const useCase = new DiagnoseTicketUseCase(repo, new FakeProvider(FILES), new FakeLLMClient());
    expect(await useCase.prepare("w_nao_existe")).toBeNull();
  });
});

describe("DiagnoseTicketUseCase.prepare com eventFocus", () => {
  it("substitui o dump do objeto raiz pelo corpo do evento isolado", async () => {
    const repo = await ingestFakeCodebase();
    const useCase = new DiagnoseTicketUseCase(repo, new FakeProvider(FILES), new FakeLLMClient());

    const prep = await useCase.prepare("w_confirm_agm", 1, ["embeds", "references"], {
      owner: "dw_agm18tab",
      name: "ue_zoom",
    });

    expect(prep!.focusedOnEvent).toBe(true);
    expect(prep!.objectContext).toContain("EVENTO: dw_agm18tab.ue_zoom");
    expect(prep!.objectContext).toContain("OpenWithParm");
    // ancestrais/dataobjects continuam presentes, só o objeto raiz vira evento isolado
    expect(prep!.objectContext).toContain("w_sheet_gen");
  });

  it("lança erro descritivo quando o evento não existe no objeto raiz", async () => {
    const repo = await ingestFakeCodebase();
    const useCase = new DiagnoseTicketUseCase(repo, new FakeProvider(FILES), new FakeLLMClient());

    await expect(
      useCase.prepare("w_confirm_agm", 1, [], { owner: "dw_agm18tab", name: "inexistente" }),
    ).rejects.toThrow(/não encontrado/);
  });

  it("dumpedObjects continua listando o objeto raiz para fins de relatório", async () => {
    const repo = await ingestFakeCodebase();
    const useCase = new DiagnoseTicketUseCase(repo, new FakeProvider(FILES), new FakeLLMClient());

    const prep = await useCase.prepare("w_confirm_agm", 1, [], { owner: "dw_agm18tab", name: "ue_zoom" });
    expect(prep!.dumpedObjects.map((o) => o.name)).toContain("w_confirm_agm");
  });
});

describe("DiagnoseTicketUseCase.diagnose", () => {
  it("repassa o contexto concatenado e o texto do chamado ao ILLMClient", async () => {
    const repo = await ingestFakeCodebase();
    const llm = new FakeLLMClient();
    const useCase = new DiagnoseTicketUseCase(repo, new FakeProvider(FILES), llm);

    const prep = await useCase.prepare("w_confirm_agm");
    const result = await useCase.diagnose(prep!, "Descrição do chamado de teste");

    expect(result.text).toBe("Causa raiz: fake");
    expect(llm.lastContext?.ticketText).toBe("Descrição do chamado de teste");
    expect(llm.lastContext?.objectContext).toContain("w_confirm_agm");
    expect(llm.lastContext?.objectContext).toContain("w_sheet_gen");
  });

  it("repassa as imagens de evidência ao ILLMClient quando fornecidas", async () => {
    const repo = await ingestFakeCodebase();
    const llm = new FakeLLMClient();
    const useCase = new DiagnoseTicketUseCase(repo, new FakeProvider(FILES), llm);

    const prep = await useCase.prepare("w_confirm_agm");
    const images = [{ mediaType: "image/png" as const, base64Data: "ZmFrZQ==" }];
    await useCase.diagnose(prep!, "chamado", images);

    expect(llm.lastContext?.images).toEqual(images);
  });

  it("repassa o comentário do tech lead ao ILLMClient quando fornecido", async () => {
    const repo = await ingestFakeCodebase();
    const llm = new FakeLLMClient();
    const useCase = new DiagnoseTicketUseCase(repo, new FakeProvider(FILES), llm);

    const prep = await useCase.prepare("w_confirm_agm");
    await useCase.diagnose(prep!, "chamado", undefined, "suspeito do evento ue_zoom");

    expect(llm.lastContext?.techLeadComment).toBe("suspeito do evento ue_zoom");
  });
});
