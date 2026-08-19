import { describe, expect, it } from "vitest";
import type { PBObject } from "../../src/domain/entities/pb-object.js";
import { HeuristicDependencyExtractor } from "../../src/infrastructure/parsers/heuristic-dependency-extractor.js";

function obj(partial: Partial<PBObject> & Pick<PBObject, "id" | "name" | "type">): PBObject {
  return {
    ancestor: null,
    library: "lib",
    filePath: `lib.pbl.src/${partial.name}`,
    contentHash: "hash",
    structured: {},
    ...partial,
  };
}

describe("HeuristicDependencyExtractor", () => {
  const extractor = new HeuristicDependencyExtractor();

  const wSheetGen = obj({ id: "gen/w_sheet_gen", name: "w_sheet_gen", type: "Window", library: "gen" });
  const uDwPadrao = obj({ id: "gen/u_datawindow_padrao", name: "u_datawindow_padrao", type: "UserObject", library: "gen" });
  const dConf = obj({ id: "lib/d_agm18tab_conf", name: "d_agm18tab_conf", type: "DataWindow" });
  const fCalc = obj({ id: "gen/f_chave_valor_string", name: "f_chave_valor_string", type: "Function", library: "gen" });
  const wOutra = obj({ id: "lib/w_agm_obs", name: "w_agm_obs", type: "Window" });
  const wConfirm = obj({
    id: "lib/w_confirm_agm",
    name: "w_confirm_agm",
    type: "Window",
    ancestor: "w_sheet_gen",
    structured: {
      controls: [
        { name: "dw_agm18tab", fromType: "u_datawindow_padrao" },
        { name: "cb_ok", fromType: "commandbutton" }, // built-in: não vira aresta
      ],
      dataObjects: ["d_agm18tab_conf", "d_inexistente"],
    },
  });

  const all = [wSheetGen, uDwPadrao, dConf, fCalc, wOutra, wConfirm];
  const raw = new Map([
    [
      wConfirm.id,
      `event ue_zoom;\n  f_chave_valor_string("unidade")\n  OpenWithParm(w_agm_obs, lstr_parm)\n  ls_local = wf_interna(1)\nend event`,
    ],
  ]);

  const edges = extractor.extract(all, raw);
  const from = (type: string) => edges.filter((e) => e.fromId === wConfirm.id && e.type === type);

  it("gera aresta inherits para o ancestral conhecido", () => {
    expect(from("inherits")).toEqual([
      { fromId: wConfirm.id, toId: wSheetGen.id, type: "inherits" },
    ]);
  });

  it("gera embeds só para tipos de controle que são objetos conhecidos", () => {
    expect(from("embeds")).toEqual([
      { fromId: wConfirm.id, toId: uDwPadrao.id, type: "embeds" },
    ]);
  });

  it("gera references só para dataobjects que existem no snapshot", () => {
    expect(from("references")).toEqual([
      { fromId: wConfirm.id, toId: dConf.id, type: "references" },
    ]);
  });

  it("gera opens para janelas conhecidas passadas a OpenWithParm", () => {
    expect(from("opens")).toEqual([{ fromId: wConfirm.id, toId: wOutra.id, type: "opens" }]);
  });

  it("gera function_call apenas para funções globais conhecidas (wf_interna é ignorada)", () => {
    expect(from("function_call")).toEqual([
      { fromId: wConfirm.id, toId: fCalc.id, type: "function_call" },
    ]);
  });

  it("prefere objeto da mesma PBL em colisão de nome", () => {
    const dLocal = obj({ id: "lib/d_dup", name: "d_dup", type: "DataWindow" });
    const dRemote = obj({ id: "outra/d_dup", name: "d_dup", type: "DataWindow", library: "outra" });
    const w = obj({
      id: "lib/w_z",
      name: "w_z",
      type: "Window",
      structured: { dataObjects: ["d_dup"] },
    });
    const result = extractor.extract([dRemote, dLocal, w], new Map());
    expect(result).toEqual([{ fromId: "lib/w_z", toId: "lib/d_dup", type: "references" }]);
  });
});
