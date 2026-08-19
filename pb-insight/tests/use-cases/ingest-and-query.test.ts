import { describe, expect, it } from "vitest";
import type {
  ISourceFileProvider,
  SourceFile,
} from "../../src/application/ports/source-file-provider.port.js";
import { IngestCodebaseVersionUseCase } from "../../src/application/use-cases/ingest-codebase-version/ingest-codebase-version.use-case.js";
import { QueryObjectContextUseCase } from "../../src/application/use-cases/query-object-context/query-object-context.use-case.js";
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

// Mini-codebase que reproduz a topologia do caso real do zoom:
// w_confirm_agm herda de w_sheet_gen, embute u_datawindow_padrao e
// referencia d_agm18tab_conf.
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
    relativePath: "ag/ag.pbl.src/w_confirm_agm.srw",
    content: [
      "$PBExportHeader$w_confirm_agm.srw",
      "global type w_confirm_agm from w_sheet_gen",
      "end type",
      "type dw_agm18tab from u_datawindow_padrao within w_confirm_agm",
      'string dataobject = "d_agm18tab_conf"',
      "end type",
    ].join("\n"),
  },
];

async function ingest() {
  const repo = new JsonObjectRepository();
  const useCase = new IngestCodebaseVersionUseCase(
    new FakeProvider(FILES),
    new ParserRegistry(),
    new HeuristicDependencyExtractor(),
    repo,
  );
  const report = await useCase.execute("teste");
  return { repo, report };
}

describe("IngestCodebaseVersionUseCase", () => {
  it("parseia todos os arquivos e monta o grafo", async () => {
    const { repo, report } = await ingest();
    expect(report.parsedCount).toBe(4);
    expect(report.skipped).toEqual([]);
    expect(await repo.countObjects()).toBe(4);
    // inherits + embeds + references + inherits do próprio u_ (datawindow é built-in → não)
    expect(await repo.countDependencies()).toBe(3);
  });
});

describe("QueryObjectContextUseCase", () => {
  it("resolve a cadeia de ancestrais e os relacionados — a lacuna do teste-minimo", async () => {
    const { repo } = await ingest();
    const context = await new QueryObjectContextUseCase(repo).execute("w_confirm_agm", 2);

    expect(context).not.toBeNull();
    expect(context!.root.name).toBe("w_confirm_agm");
    expect(context!.ancestors.map((a) => a.name)).toEqual(["w_sheet_gen"]);

    const relatedNames = context!.related.map((r) => r.object.name);
    expect(relatedNames).toContain("u_datawindow_padrao");
    expect(relatedNames).toContain("d_agm18tab_conf");
  });

  it("lista dependentes reversos (quem usa o objeto)", async () => {
    const { repo } = await ingest();
    const context = await new QueryObjectContextUseCase(repo).execute("u_datawindow_padrao", 1);
    expect(context!.dependents.map((d) => d.object.name)).toContain("w_confirm_agm");
  });

  it("retorna null para objeto inexistente", async () => {
    const { repo } = await ingest();
    expect(await new QueryObjectContextUseCase(repo).execute("w_nao_existe")).toBeNull();
  });

  it("agrega dependentes de todos os PBLs quando o nome colide entre bibliotecas", async () => {
    // Reproduz o caso relatado: d_lmc02tab existe em agenda50 E em
    // atende50/repac50 (mesmo nome, IDs distintos), cada um usado por uma
    // janela diferente. Antes do fix, apenas o 1º match era considerado e o
    // uso em atende50/repac50 desaparecia do resultado.
    const dupFiles: SourceFile[] = [
      {
        relativePath: "agenda50/agenda50.pbl.src/d_dup.srd",
        content: `$PBExportHeader$d_dup.srd\nrelease 12.5;\ntable(column=(type=char(1) name=x dbname="x" ) )`,
      },
      {
        relativePath: "atende50/repac50.pbl.src/d_dup.srd",
        content: `$PBExportHeader$d_dup.srd\nrelease 12.5;\ntable(column=(type=char(1) name=y dbname="y" ) )`,
      },
      {
        relativePath: "agenda50/agenda50.pbl.src/w_agenda.srw",
        content: [
          "$PBExportHeader$w_agenda.srw",
          "global type w_agenda from window",
          "end type",
          "type dw_1 from datawindow within w_agenda",
          'string dataobject = "d_dup"',
          "end type",
        ].join("\n"),
      },
      {
        relativePath: "atende50/repac50.pbl.src/w_repac.srw",
        content: [
          "$PBExportHeader$w_repac.srw",
          "global type w_repac from window",
          "end type",
          "type dw_1 from datawindow within w_repac",
          'string dataobject = "d_dup"',
          "end type",
        ].join("\n"),
      },
    ];
    const repo = new JsonObjectRepository();
    await new IngestCodebaseVersionUseCase(
      new FakeProvider(dupFiles),
      new ParserRegistry(),
      new HeuristicDependencyExtractor(),
      repo,
    ).execute("teste-dup");

    const context = await new QueryObjectContextUseCase(repo).execute("d_dup", 1);
    expect(context).not.toBeNull();
    expect(context!.ambiguities.length).toBe(1);

    const dependentNames = context!.dependents.map((d) => d.object.name);
    expect(dependentNames).toContain("w_agenda");
    expect(dependentNames).toContain("w_repac");
  });
});
