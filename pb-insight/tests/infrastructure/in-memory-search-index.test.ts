import { describe, expect, it } from "vitest";
import type { PBEventBlock, PBObject } from "../../src/domain/entities/pb-object.js";
import { InMemorySearchIndex } from "../../src/infrastructure/search/in-memory-search-index.js";

function objWith(
  id: string,
  overrides: { uiStrings?: string[]; events?: PBEventBlock[]; type?: PBObject["type"] },
): PBObject {
  return {
    id,
    name: id.split("/").pop()!,
    type: overrides.type ?? "Window",
    ancestor: null,
    library: id.split("/").slice(0, -1).join("/"),
    filePath: `${id}.srw`,
    contentHash: "h",
    structured: { uiStrings: overrides.uiStrings, events: overrides.events },
  };
}

function event(overrides: Partial<PBEventBlock>): PBEventBlock {
  return { kind: "event", owner: "w_x", name: "zoom", body: "", startLine: 1, endLine: 1, ...overrides };
}

describe("InMemorySearchIndex", () => {
  it("acha por UI string, tolerante a acento e caixa", () => {
    const dLmc = objWith("cadgf/d_lmc02tab", { uiStrings: ["Período", "Quantidade"] });
    const index = new InMemorySearchIndex([dLmc]);
    expect(index.search("periodo")).toEqual([{ kind: "ui_string", object: dLmc, matchedText: "Período" }]);
  });

  it("acha dentro do corpo de um evento, retornando owner/name/linhas", () => {
    const w = objWith("ag/w_confirm_agm", {
      events: [event({ owner: "dw_agm18tab", name: "zoom", body: "This.GroupCalc()\nThis.ScrollToRow(nSelRow)", startLine: 10, endLine: 40 })],
    });
    const index = new InMemorySearchIndex([w]);
    const matches = index.search("scrolltorow");

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      kind: "event",
      object: w,
      event: { owner: "dw_agm18tab", name: "zoom", startLine: 10, endLine: 40 },
    });
    expect(matches[0]?.matchedText).toContain("ScrollToRow");
  });

  it("prioriza matches de ui_string sobre matches de código", () => {
    const w = objWith("ag/w_x", {
      uiStrings: ["Confirmar"],
      events: [event({ body: "Confirmar()" })],
    });
    const index = new InMemorySearchIndex([w]);
    const matches = index.search("confirmar");

    expect(matches).toHaveLength(2);
    expect(matches[0]?.kind).toBe("ui_string");
    expect(matches[1]?.kind).toBe("event");
  });

  it("gera snippet com reticências quando o match não está nas bordas do corpo", () => {
    const longBody = "x".repeat(200) + "ALVO" + "y".repeat(200);
    const w = objWith("ag/w_x", { events: [event({ body: longBody })] });
    const index = new InMemorySearchIndex([w]);

    const snippet = index.search("alvo")[0]?.matchedText ?? "";
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("ALVO");
  });

  it("retorna vazio quando não há ocorrência em nenhuma superfície", () => {
    const w = objWith("ag/w_x", { uiStrings: ["Confirmar"], events: [event({ body: "nada aqui" })] });
    expect(new InMemorySearchIndex([w]).search("inexistente")).toEqual([]);
  });

  it("respeita o limite combinando as duas superfícies", () => {
    const objects = [1, 2, 3].map((n) => objWith(`ag/w_${n}`, { uiStrings: [`Período ${n}`] }));
    expect(new InMemorySearchIndex(objects).search("periodo", 2)).toHaveLength(2);
  });

  it("filtra por PBObjectType quando `types` é passado", () => {
    const window = objWith("ag/w_x", { uiStrings: ["Período"], type: "Window" });
    const dw = objWith("ag/d_x", { uiStrings: ["Período"], type: "DataWindow" });
    const index = new InMemorySearchIndex([window, dw]);

    const onlyDw = index.search("periodo", 20, ["DataWindow"]);
    expect(onlyDw).toHaveLength(1);
    expect(onlyDw[0]?.object.type).toBe("DataWindow");

    const both = index.search("periodo", 20, ["DataWindow", "Window"]);
    expect(both).toHaveLength(2);
  });

  it("filtra ANTES de aplicar o limite — não perde matches do tipo pedido", () => {
    // 3 Windows (que viriam primeiro por ui_string) + 1 DataWindow — sem
    // filtrar antes do corte, limit=1 devolveria só a Window e "sumiria"
    // com o único resultado do tipo pedido.
    const windows = [1, 2, 3].map((n) => objWith(`ag/w_${n}`, { uiStrings: [`Período ${n}`], type: "Window" }));
    const dw = objWith("ag/d_x", { uiStrings: ["Período"], type: "DataWindow" });
    const index = new InMemorySearchIndex([...windows, dw]);

    const result = index.search("periodo", 1, ["DataWindow"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.object.type).toBe("DataWindow");
  });

  it("types vazio ou ausente não filtra nada", () => {
    const window = objWith("ag/w_x", { uiStrings: ["Período"], type: "Window" });
    const index = new InMemorySearchIndex([window]);
    expect(index.search("periodo", 20, [])).toHaveLength(1);
    expect(index.search("periodo")).toHaveLength(1);
  });
});
