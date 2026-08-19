import { describe, expect, it } from "vitest";
import type { PBObject } from "../../src/domain/entities/pb-object.js";
import { diffObjectSnapshots } from "../../src/domain/services/diff-object-snapshots.js";

function obj(id: string, hash: string): PBObject {
  const name = id.split("/").pop()!;
  return {
    id,
    name,
    type: "Window",
    ancestor: null,
    library: id.split("/").slice(0, -1).join("/"),
    filePath: `${id}.srw`,
    contentHash: hash,
    structured: {},
  };
}

describe("diffObjectSnapshots", () => {
  it("detecta objeto adicionado", () => {
    const from = [obj("ag/w_a", "h1")];
    const to = [obj("ag/w_a", "h1"), obj("ag/w_b", "h2")];
    const entries = diffObjectSnapshots(from, to);
    expect(entries).toEqual([{ id: "ag/w_b", name: "w_b", type: "Window", changeType: "added", toHash: "h2" }]);
  });

  it("detecta objeto removido", () => {
    const from = [obj("ag/w_a", "h1"), obj("ag/w_b", "h2")];
    const to = [obj("ag/w_a", "h1")];
    const entries = diffObjectSnapshots(from, to);
    expect(entries).toEqual([{ id: "ag/w_b", name: "w_b", type: "Window", changeType: "removed", fromHash: "h2" }]);
  });

  it("detecta objeto modificado (mesmo id, hash diferente) — o caso do fix do zoom", () => {
    const from = [obj("ag/w_confirm_agm", "hash-antes-do-fix")];
    const to = [obj("ag/w_confirm_agm", "hash-depois-do-fix")];
    const entries = diffObjectSnapshots(from, to);
    expect(entries).toEqual([
      {
        id: "ag/w_confirm_agm",
        name: "w_confirm_agm",
        type: "Window",
        changeType: "modified",
        fromHash: "hash-antes-do-fix",
        toHash: "hash-depois-do-fix",
      },
    ]);
  });

  it("não reporta objetos inalterados", () => {
    const from = [obj("ag/w_a", "h1")];
    const to = [obj("ag/w_a", "h1")];
    expect(diffObjectSnapshots(from, to)).toEqual([]);
  });

  it("ordena o resultado por id", () => {
    const from: PBObject[] = [];
    const to = [obj("ag/w_z", "h"), obj("ag/w_a", "h")];
    const entries = diffObjectSnapshots(from, to);
    expect(entries.map((e) => e.id)).toEqual(["ag/w_a", "ag/w_z"]);
  });
});
