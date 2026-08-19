import { describe, expect, it } from "vitest";
import { normalizeText } from "../../src/domain/value-objects/normalize-text.js";

describe("normalizeText", () => {
  it("remove acentos e converte para minúsculas", () => {
    expect(normalizeText("Período")).toBe("periodo");
    expect(normalizeText("PERÍODO")).toBe("periodo");
    expect(normalizeText("Confirmação de Marcação")).toBe("confirmacao de marcacao");
  });

  it("remove espaço nas pontas", () => {
    expect(normalizeText("  Período  ")).toBe("periodo");
  });

  it("é idempotente em texto já normalizado", () => {
    expect(normalizeText("periodo")).toBe("periodo");
  });
});
