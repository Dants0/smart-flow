import type { ILLMClient } from "../../application/ports/llm-client.port.js";
import { ClaudeDiagnosticClient } from "./claude-diagnostic-client.js";
import { OpenAIDiagnosticClient } from "./openai-diagnostic-client.js";

export const LLM_PROVIDERS = ["claude", "openai"] as const;
export type LLMProvider = (typeof LLM_PROVIDERS)[number];

export const DEFAULT_LLM_PROVIDER: LLMProvider = "claude";

/**
 * Ponto único de escolha de provedor/modelo — usado tanto pelo CLI
 * (`diagnose.command.ts --provider/--model`) quanto pela API HTTP
 * (`POST /diagnose` body `provider`/`model`), para não duplicar a lógica de
 * seleção em dois lugares.
 *
 * Nenhum dos dois clientes chama a rede na construção — só no
 * `synthesizeDiagnosis()` — então criar um por requisição é barato.
 */
export function createLLMClient(provider: LLMProvider = DEFAULT_LLM_PROVIDER, model?: string): ILLMClient {
  switch (provider) {
    case "claude":
      return model ? new ClaudeDiagnosticClient(model) : new ClaudeDiagnosticClient();
    case "openai":
      return model ? new OpenAIDiagnosticClient(model) : new OpenAIDiagnosticClient();
    default: {
      const exhaustive: never = provider;
      throw new Error(`Provedor de LLM desconhecido: ${exhaustive as string}`);
    }
  }
}

export function isValidLLMProvider(value: string): value is LLMProvider {
  return (LLM_PROVIDERS as readonly string[]).includes(value);
}
