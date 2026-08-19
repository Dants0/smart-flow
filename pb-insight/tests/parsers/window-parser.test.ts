import { describe, expect, it } from "vitest";
import { WindowParser } from "../../src/infrastructure/parsers/window-parser.js";

const FIXTURE = `$PBExportHeader$w_confirm_agm.srw
forward
global type w_confirm_agm from w_sheet_gen
end type
type dw_agm18tab from u_datawindow_padrao within w_confirm_agm
end type
type cb_ok from commandbutton within w_confirm_agm
end type
end forward

global type w_confirm_agm from w_sheet_gen
integer width = 4754
string title = "Confirmação de Marcação"
end type

type dw_agm18tab from u_datawindow_padrao within w_confirm_agm
string dataobject = "d_agm18tab_conf"
end type

type cb_ok from commandbutton within w_confirm_agm
string text = "&Confirmar"
end type
`;

describe("WindowParser", () => {
  const parser = new WindowParser();

  it("extrai nome, ancestral e identidade a partir do header e da declaração global", () => {
    const result = parser.parse(FIXTURE, "agenda50/ag_conf/ag_conf.pbl.src/w_confirm_agm.srw");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.name).toBe("w_confirm_agm");
    expect(result.value.ancestor).toBe("w_sheet_gen");
    expect(result.value.type).toBe("Window");
    expect(result.value.library).toBe("agenda50/ag_conf/ag_conf");
    expect(result.value.id).toBe("agenda50/ag_conf/ag_conf/w_confirm_agm");
  });

  it("extrai controles embutidos com seus tipos de origem", () => {
    const result = parser.parse(FIXTURE, "x/y.pbl.src/w_confirm_agm.srw");
    if (!result.ok) throw new Error("parse falhou");

    expect(result.value.structured.controls).toContainEqual({
      name: "dw_agm18tab",
      fromType: "u_datawindow_padrao",
    });
    expect(result.value.structured.controls).toContainEqual({
      name: "cb_ok",
      fromType: "commandbutton",
    });
  });

  it("extrai referências de dataobject e UI strings", () => {
    const result = parser.parse(FIXTURE, "x/y.pbl.src/w_confirm_agm.srw");
    if (!result.ok) throw new Error("parse falhou");

    expect(result.value.structured.dataObjects).toEqual(["d_agm18tab_conf"]);
    expect(result.value.structured.uiStrings).toContain("Confirmação de Marcação");
    expect(result.value.structured.uiStrings).toContain("&Confirmar");
  });

  it("usa o nome do arquivo quando não há header de export", () => {
    const result = parser.parse("global type w_x from window\nend type", "lib.pbl.src/w_x.srw");
    if (!result.ok) throw new Error("parse falhou");
    expect(result.value.name).toBe("w_x");
    expect(result.value.ancestor).toBe("window");
  });
});
