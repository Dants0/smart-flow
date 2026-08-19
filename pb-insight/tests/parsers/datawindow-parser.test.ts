import { describe, expect, it } from "vitest";
import { DataWindowParser } from "../../src/infrastructure/parsers/datawindow-parser.js";

const FIXTURE = `$PBExportHeader$d_lmc02tab.srd
release 12.5;
datawindow(units=0 timer_interval=0 color=1090519039 )
table(column=(type=char(1) updatewhereclause=yes name=lmc_periodo dbname="lmc.lmc_periodo" values="Segunda	2/Terça	3/Quarta	4/Quinta	5/Sexta	6/Sábado	7" )
 column=(type=decimal(0) updatewhereclause=yes name=lmc_qtde dbname="lmc.lmc_qtde" )
 retrieve="SELECT lmc.lmc_periodo, lmc.lmc_qtde FROM lmc WHERE lmc.lmc_cnv = :an_cnv" )
text(band=header text="Período" name=lmc_periodo_t )
`;

describe("DataWindowParser", () => {
  const parser = new DataWindowParser();

  it("extrai colunas com dbname", () => {
    const result = parser.parse(FIXTURE, "cadgf50/x.pbl.src/d_lmc02tab.srd");
    if (!result.ok) throw new Error("parse falhou");

    const columns = result.value.structured.columns ?? [];
    expect(columns.map((c) => c.name)).toEqual(["lmc_periodo", "lmc_qtde"]);
    expect(columns[0]?.dbName).toBe("lmc.lmc_periodo");
  });

  it("extrai a code table como pares display/data (caso real: Domingo ausente)", () => {
    const result = parser.parse(FIXTURE, "x.pbl.src/d_lmc02tab.srd");
    if (!result.ok) throw new Error("parse falhou");

    const codeTable = result.value.structured.columns?.[0]?.codeTable ?? [];
    expect(codeTable).toContainEqual({ display: "Segunda", data: "2" });
    expect(codeTable).toContainEqual({ display: "Sábado", data: "7" });
    expect(codeTable.map((p) => p.data)).not.toContain("1"); // Domingo ausente
  });

  it("extrai o SQL do retrieve", () => {
    const result = parser.parse(FIXTURE, "x.pbl.src/d_lmc02tab.srd");
    if (!result.ok) throw new Error("parse falhou");

    expect(result.value.structured.retrieveSql).toContain("SELECT lmc.lmc_periodo");
    expect(result.value.structured.retrieveSql).toContain("WHERE lmc.lmc_cnv = :an_cnv");
  });

  it("captura o header visual como UI string (liga 'Período' ao objeto)", () => {
    const result = parser.parse(FIXTURE, "x.pbl.src/d_lmc02tab.srd");
    if (!result.ok) throw new Error("parse falhou");

    expect(result.value.structured.uiStrings).toContain("Período");
  });

  it("desfaz escapes ~\" no SQL", () => {
    const src = `$PBExportHeader$d_x.srd\ntable(column=(type=char(1) name=a dbname="t.a" )\n retrieve="SELECT ~"campo~" FROM t" )`;
    const result = parser.parse(src, "x.pbl.src/d_x.srd");
    if (!result.ok) throw new Error("parse falhou");
    expect(result.value.structured.retrieveSql).toBe('SELECT "campo" FROM t');
  });
});
