import { describe, expect, it } from "vitest";
import type { ISourceFileProvider, SourceFile } from "../../src/application/ports/source-file-provider.port.js";
import { FindPatternSiblingsUseCase } from "../../src/application/use-cases/find-pattern-siblings/find-pattern-siblings.use-case.js";
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

/**
 * Topologia reduzida do caso real (SMART-50927): um user object de paciente,
 * um descendente dele, e quatro janelas que sobrescrevem o mesmo evento
 * `avancar` — sem NENHUMA aresta entre si. É exatamente a configuração que o
 * grafo de dependências não alcançava.
 */
function windowFile(name: string, control: string, controlType: string, body: string): SourceFile {
  return {
    relativePath: `mw/mw.pbl.src/${name}.srw`,
    content: [
      `$PBExportHeader$${name}.srw`,
      `global type ${name} from window`,
      "end type",
      `type ${control} from ${controlType} within ${name}`,
      "end type",
      "event avancar;call super::avancar;" + body,
      "end event",
    ].join("\n"),
  };
}

const FILES: SourceFile[] = [
  {
    relativePath: "gen/gen.pbl.src/u_dw_pac.sru",
    content: `$PBExportHeader$u_dw_pac.sru\nglobal type u_dw_pac from datawindow\nend type`,
  },
  {
    relativePath: "gen/gen.pbl.src/u_dw_pac_assist.sru",
    content: `$PBExportHeader$u_dw_pac_assist.sru\nglobal type u_dw_pac_assist from u_dw_pac\nend type`,
  },
  windowFile("w_raiz", "dw_pac01tab", "u_dw_pac", "SEM_GUARDA_RAIZ"),
  windowFile("w_irma_com_bug", "dw_pac01tab", "u_dw_pac", "SEM_GUARDA_IRMA"),
  windowFile("w_irma_ok", "dw_pac01", "u_dw_pac", "IF not This.i_bavancar THEN RETURN"),
  windowFile("w_irma_descendente", "dw_pac01ff", "u_dw_pac_assist", "SEM_GUARDA_DESCENDENTE"),
  {
    // Mesmo nome de controle, tipo diferente — não é ocorrência do padrão.
    relativePath: "mw/mw.pbl.src/w_sem_relacao.srw",
    content: [
      "$PBExportHeader$w_sem_relacao.srw",
      "global type w_sem_relacao from window",
      "end type",
      "type dw_pac01tab from u_datawindow_padrao within w_sem_relacao",
      "end type",
      "event avancar;call super::avancar;OUTRO_TIPO",
      "end event",
    ].join("\n"),
  },
];

async function ingest() {
  const repo = new JsonObjectRepository();
  await new IngestCodebaseVersionUseCase(
    new FakeProvider(FILES),
    new ParserRegistry(),
    new HeuristicDependencyExtractor(),
    repo,
  ).execute("teste");
  return repo;
}

describe("FindPatternSiblingsUseCase", () => {
  it("acha as janelas irmãs que só compartilham o ancestral do controle", async () => {
    const repo = await ingest();
    const root = (await repo.findByName("w_raiz"))[0]!;

    const result = await new FindPatternSiblingsUseCase(repo).execute(root, "dw_pac01tab", "avancar");

    expect(result).not.toBeNull();
    expect(result!.controlType).toBe("u_dw_pac");
    const names = result!.siblings.map((s) => s.object.name);
    expect(names).toContain("w_irma_com_bug");
    expect(names).toContain("w_irma_ok");
  });

  it("inclui controles de tipos que HERDAM do tipo do raiz", async () => {
    const repo = await ingest();
    const root = (await repo.findByName("w_raiz"))[0]!;

    const result = await new FindPatternSiblingsUseCase(repo).execute(root, "dw_pac01tab", "avancar");

    expect(result!.controlTypes).toContain("u_dw_pac_assist");
    expect(result!.siblings.map((s) => s.object.name)).toContain("w_irma_descendente");
  });

  it("ignora o mesmo evento em controle de outro tipo, mesmo com nome igual", async () => {
    const repo = await ingest();
    const root = (await repo.findByName("w_raiz"))[0]!;

    const result = await new FindPatternSiblingsUseCase(repo).execute(root, "dw_pac01tab", "avancar");

    expect(result!.siblings.map((s) => s.object.name)).not.toContain("w_sem_relacao");
  });

  it("nunca inclui o próprio objeto raiz", async () => {
    const repo = await ingest();
    const root = (await repo.findByName("w_raiz"))[0]!;

    const result = await new FindPatternSiblingsUseCase(repo).execute(root, "dw_pac01tab", "avancar");

    expect(result!.siblings.map((s) => s.object.id)).not.toContain(root.id);
  });

  it("traz o corpo do evento de cada irmã, para distinguir corrigida de defeituosa", async () => {
    const repo = await ingest();
    const root = (await repo.findByName("w_raiz"))[0]!;

    const result = await new FindPatternSiblingsUseCase(repo).execute(root, "dw_pac01tab", "avancar");

    const ok = result!.siblings.find((s) => s.object.name === "w_irma_ok");
    expect(ok!.event.body).toContain("i_bavancar");
    const bug = result!.siblings.find((s) => s.object.name === "w_irma_com_bug");
    expect(bug!.event.body).not.toContain("i_bavancar");
  });

  it("retorna null quando o controle informado não existe no objeto raiz", async () => {
    const repo = await ingest();
    const root = (await repo.findByName("w_raiz"))[0]!;

    expect(await new FindPatternSiblingsUseCase(repo).execute(root, "dw_inexistente", "avancar")).toBeNull();
  });
});

describe("FindPatternSiblingsUseCase — dedupe e prioridade", () => {
  /**
   * O fonte exportado declara o controle duas vezes (forward declaration no
   * topo + bloco real). Sem dedupe cada janela irmã entraria duplicada e
   * consumiria o dobro do teto de contexto.
   */
  const DUPLICATE_FILES: SourceFile[] = [
    {
      relativePath: "gen/gen.pbl.src/u_dw_pac.sru",
      content: `$PBExportHeader$u_dw_pac.sru\nglobal type u_dw_pac from datawindow\nend type`,
    },
    {
      relativePath: "mwsus/mwsus.pbl.src/w_raiz.srw",
      content: [
        "$PBExportHeader$w_raiz.srw",
        "global type w_raiz from window",
        "type dw_pac01tab from u_dw_pac within w_raiz",
        "end type",
        "end type",
        "type dw_pac01tab from u_dw_pac within w_raiz",
        "end type",
        "event avancar;call super::avancar;RAIZ",
        "end event",
      ].join("\n"),
    },
    {
      relativePath: "mwsus/mwsus.pbl.src/w_mesma_pbl.srw",
      content: [
        "$PBExportHeader$w_mesma_pbl.srw",
        "global type w_mesma_pbl from window",
        "type dw_pac01tab from u_dw_pac within w_mesma_pbl",
        "end type",
        "end type",
        "type dw_pac01tab from u_dw_pac within w_mesma_pbl",
        "end type",
        "event avancar;call super::avancar;MESMA_PBL",
        "end event",
      ].join("\n"),
    },
    {
      // "agenda" ordena antes de "mwsus" por id — sem prioridade por PBL, seria
      // esta que sobreviveria a um teto apertado.
      relativePath: "agenda/agenda.pbl.src/w_outra_pbl.srw",
      content: [
        "$PBExportHeader$w_outra_pbl.srw",
        "global type w_outra_pbl from window",
        "end type",
        "type dw_pac01tab from u_dw_pac within w_outra_pbl",
        "end type",
        "event avancar;call super::avancar;OUTRA_PBL",
        "end event",
      ].join("\n"),
    },
  ];

  async function ingestDuplicates() {
    const repo = new JsonObjectRepository();
    await new IngestCodebaseVersionUseCase(
      new FakeProvider(DUPLICATE_FILES),
      new ParserRegistry(),
      new HeuristicDependencyExtractor(),
      repo,
    ).execute("teste");
    return repo;
  }

  it("não repete a irmã quando o controle é declarado duas vezes no fonte", async () => {
    const repo = await ingestDuplicates();
    const root = (await repo.findByName("w_raiz"))[0]!;

    const result = await new FindPatternSiblingsUseCase(repo).execute(root, "dw_pac01tab", "avancar");

    const mesmaPbl = result!.siblings.filter((s) => s.object.name === "w_mesma_pbl");
    expect(mesmaPbl).toHaveLength(1);
  });

  it("põe as irmãs da mesma PBL na frente, para o teto cortar o menos relevante", async () => {
    const repo = await ingestDuplicates();
    const root = (await repo.findByName("w_raiz"))[0]!;

    const result = await new FindPatternSiblingsUseCase(repo).execute(root, "dw_pac01tab", "avancar");

    expect(result!.siblings.map((s) => s.object.name)).toEqual(["w_mesma_pbl", "w_outra_pbl"]);
  });
});
