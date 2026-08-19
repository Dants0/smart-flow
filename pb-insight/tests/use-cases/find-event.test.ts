import { describe, expect, it } from "vitest";
import type { ISourceFileProvider, SourceFile } from "../../src/application/ports/source-file-provider.port.js";
import { FindEventUseCase } from "../../src/application/use-cases/find-event/find-event.use-case.js";
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

const FILES: SourceFile[] = [
  {
    relativePath: "ag/ag.pbl.src/w_confirm_agm.srw",
    content: [
      "$PBExportHeader$w_confirm_agm.srw",
      "global type w_confirm_agm from window",
      "end type",
      "",
      "event open;call super::open;x = 1",
      "end event",
      "",
      "type dw_agm18tab from u_datawindow_padrao within w_confirm_agm",
      "end type",
      "",
      "event zoom;call super::zoom;LONG nSelRow",
      "This.GroupCalc()",
      "end event",
      "",
      "type dw_outra from u_datawindow_padrao within w_confirm_agm",
      "end type",
      "",
      "event zoom;call super::zoom;LONG nOutro",
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

describe("FindEventUseCase", () => {
  it("acha o evento do próprio objeto (dono = objeto raiz)", async () => {
    const repo = await ingestFakeCodebase();
    const matches = await new FindEventUseCase(repo).execute("w_confirm_agm", "open");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.event.owner).toBe("w_confirm_agm");
  });

  it("retorna todas as ocorrências quando dois controles têm evento de mesmo nome", async () => {
    const repo = await ingestFakeCodebase();
    const matches = await new FindEventUseCase(repo).execute("w_confirm_agm", "zoom");
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.event.owner).sort()).toEqual(["dw_agm18tab", "dw_outra"]);
  });

  it("filtra por --owner quando fornecido", async () => {
    const repo = await ingestFakeCodebase();
    const matches = await new FindEventUseCase(repo).execute("w_confirm_agm", "zoom", "dw_agm18tab");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.event.body).toContain("GroupCalc");
  });

  it("retorna vazio quando o evento não existe", async () => {
    const repo = await ingestFakeCodebase();
    expect(await new FindEventUseCase(repo).execute("w_confirm_agm", "inexistente")).toEqual([]);
  });
});
