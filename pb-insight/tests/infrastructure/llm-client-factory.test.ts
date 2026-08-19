import { describe, expect, it } from "vitest";
import { ClaudeDiagnosticClient } from "../../src/infrastructure/llm/claude-diagnostic-client.js";
import {
  createLLMClient,
  DEFAULT_LLM_PROVIDER,
  isValidLLMProvider,
  LLM_PROVIDERS,
} from "../../src/infrastructure/llm/llm-client-factory.js";
import { OpenAIDiagnosticClient } from "../../src/infrastructure/llm/openai-diagnostic-client.js";

describe("llm-client-factory", () => {
  it("o provedor default é claude, não o mais caro por acidente", () => {
    expect(DEFAULT_LLM_PROVIDER).toBe("claude");
  });

  it("cria ClaudeDiagnosticClient para provider claude (ou default)", () => {
    expect(createLLMClient("claude")).toBeInstanceOf(ClaudeDiagnosticClient);
    expect(createLLMClient()).toBeInstanceOf(ClaudeDiagnosticClient);
  });

  it("cria OpenAIDiagnosticClient para provider openai", () => {
    // O SDK da OpenAI valida a credencial já no construtor (diferente do da
    // Anthropic, que só falha na chamada real) — precisa de uma env var
    // presente mesmo só para instanciar, sem chamar a rede.
    const previous = process.env["OPENAI_API_KEY"];
    process.env["OPENAI_API_KEY"] = "test-key";
    try {
      expect(createLLMClient("openai")).toBeInstanceOf(OpenAIDiagnosticClient);
    } finally {
      if (previous === undefined) delete process.env["OPENAI_API_KEY"];
      else process.env["OPENAI_API_KEY"] = previous;
    }
  });

  it("isValidLLMProvider aceita só os provedores conhecidos", () => {
    expect(isValidLLMProvider("claude")).toBe(true);
    expect(isValidLLMProvider("openai")).toBe(true);
    expect(isValidLLMProvider("gemini")).toBe(false);
    expect(isValidLLMProvider("")).toBe(false);
  });

  it("LLM_PROVIDERS lista exatamente claude e openai", () => {
    expect(LLM_PROVIDERS).toEqual(["claude", "openai"]);
  });
});
