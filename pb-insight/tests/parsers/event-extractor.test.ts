import { describe, expect, it } from "vitest";
import { extractEventBlocks } from "../../src/infrastructure/parsers/event-extractor.js";

describe("extractEventBlocks", () => {
  it("pula o bloco forward (esqueleto vazio) e não extrai nada dele", () => {
    const source = `forward
type gb_1 from groupbox within w_x
end type
end forward

global type w_x from window
end type
`;
    expect(extractEventBlocks(source, "w_x")).toEqual([]);
  });

  it("pula forward prototypes (só assinaturas, sem corpo)", () => {
    const source = `forward prototypes
public function boolean wf_x (long p_n)
end prototypes

event open;call super::open;x = 1
end event
`;
    const blocks = extractEventBlocks(source, "w_x");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.name).toBe("open");
  });

  it("pula type variables (declaração de instância)", () => {
    const source = `type variables
STRING i_sVar
end variables

event open;call super::open;x = 1
end event
`;
    const blocks = extractEventBlocks(source, "w_x");
    expect(blocks).toHaveLength(1);
  });

  it("atribui eventos ao próprio objeto antes de qualquer 'within'", () => {
    const source = `event open;call super::open;LONG ll_x
ll_x = 1
end event
`;
    const blocks = extractEventBlocks(source, "w_confirm_agm");
    expect(blocks).toEqual([
      {
        kind: "event",
        owner: "w_confirm_agm",
        name: "open",
        body: "LONG ll_x\nll_x = 1",
        startLine: 1,
        endLine: 3,
      },
    ]);
  });

  it("troca o dono ao encontrar 'type X from Y within Z' e atribui eventos seguintes ao controle", () => {
    const source = [
      "event open;call super::open;x = 1",
      "end event",
      "",
      "type dw_agm18tab from u_datawindow_padrao within w_confirm_agm",
      'string dataobject = "d_agm18tab_conf"',
      "end type",
      "",
      "event getfocus;call super::getfocus;SDwName = 1",
      "end event",
    ].join("\n");

    const blocks = extractEventBlocks(source, "w_confirm_agm");
    expect(blocks.map((b) => ({ owner: b.owner, name: b.name }))).toEqual([
      { owner: "w_confirm_agm", name: "open" },
      { owner: "dw_agm18tab", name: "getfocus" },
    ]);
  });

  it("captura corpo que começa na mesma linha do 'event nome;call super::nome;'", () => {
    const source = `event getfocus;call super::getfocus;SDwName = "w_confirm_agm.dw_agm18tab"

This.setFilter("")
This.Filter()
end event
`;
    const blocks = extractEventBlocks(source, "w_x");
    expect(blocks[0]?.body).toBe('SDwName = "w_confirm_agm.dw_agm18tab"\n\nThis.setFilter("")\nThis.Filter()');
  });

  it("captura evento customizado sem 'call super::' (ex: ue_zoom)", () => {
    const source = `event ue_zoom;STRING sVar
sVar = "x"
end event
`;
    const blocks = extractEventBlocks(source, "w_x");
    expect(blocks[0]).toMatchObject({ kind: "event", name: "ue_zoom" });
    expect(blocks[0]?.body).toBe('STRING sVar\nsVar = "x"');
  });

  it("extrai 'public function' com retorno e parâmetros, corpo após ');'", () => {
    const source = `public function boolean wf_testar (datawindow p_dwdados);Long npacreg
npacreg = 1
end function
`;
    const blocks = extractEventBlocks(source, "w_x");
    expect(blocks).toEqual([
      {
        kind: "function",
        owner: "w_x",
        name: "wf_testar",
        body: "Long npacreg\nnpacreg = 1",
        startLine: 1,
        endLine: 3,
      },
    ]);
  });

  it("extrai 'global function' de arquivo .srf (função global standalone)", () => {
    const source = `global type f_get_login from function_object
end type

forward prototypes
global function string f_get_login ()
end prototypes

global function string f_get_login ();return login
end function
`;
    const blocks = extractEventBlocks(source, "f_get_login");
    expect(blocks).toEqual([
      {
        kind: "function",
        owner: "f_get_login",
        name: "f_get_login",
        body: "return login",
        startLine: 8,
        endLine: 9,
      },
    ]);
  });

  it("extrai 'public subroutine' (sem tipo de retorno)", () => {
    const source = `public subroutine wf_gerar_os_from_guia ();MessageBox("x","y")
end subroutine
`;
    const blocks = extractEventBlocks(source, "w_x");
    expect(blocks[0]).toMatchObject({ kind: "subroutine", name: "wf_gerar_os_from_guia" });
  });

  it("registra startLine/endLine 1-indexados corretamente", () => {
    const source = `linha 1 qualquer
event open;call super::open;
linha do corpo
end event
`;
    const blocks = extractEventBlocks(source, "w_x");
    expect(blocks[0]?.startLine).toBe(2);
    expect(blocks[0]?.endLine).toBe(4);
  });

  it("caso real: reproduz exatamente a topologia getfocus/retrieveend/clicked citada na validação (docs/03)", () => {
    const source = [
      "type dw_agm18tab from u_datawindow_padrao within w_confirm_agm",
      "end type",
      "",
      'event getfocus;call super::getfocus;SDwName = "w_confirm_agm.dw_agm18tab"',
      "This.setFilter(\"\")",
      "This.Filter()",
      "end event",
      "",
      "event retrieveend;call super::retrieveend;LONG nRn",
      "FOR nRn = 1 TO This.rowCount()",
      "NEXT",
      "This.setRow(1)",
      "end event",
      "",
      "event clicked;call super::clicked;IF cbx_apenas_selec.Checked THEN",
      "f_seleciona_linha50 ( This, row )",
      "END IF",
      "end event",
    ].join("\n");

    const blocks = extractEventBlocks(source, "w_confirm_agm");
    expect(blocks.map((b) => b.name)).toEqual(["getfocus", "retrieveend", "clicked"]);
    expect(blocks.every((b) => b.owner === "dw_agm18tab")).toBe(true);
    expect(blocks[1]?.body).toContain("This.setRow(1)");
  });
});
