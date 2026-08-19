export type AiProvider = "openai" | "anthropic" | "gemini" | "groq" | "azure";

export interface TraceProviderSettings {
  provider: AiProvider;
  model: string;
  apiKey: string;
  azureEndpoint?: string;
}

const STORAGE_KEY = "smart-ai-flow:trace-provider";

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  groq: "Groq (Llama)",
  azure: "Azure OpenAI (Copilot)",
};

// Modelo default por provider. O app_trace roteia por substring no nome do
// modelo ("gemini", "claude", "llama", "copilot"), então esses defaults já
// batem com a regra dele — só o de Azure exige literalmente "copilot" no nome.
export const PROVIDER_DEFAULT_MODEL: Record<AiProvider, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-5",
  gemini: "gemini-1.5-flash",
  groq: "llama-3.1-70b-versatile",
  azure: "copilot",
};

export function loadTraceProviderSettings(): TraceProviderSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TraceProviderSettings) : null;
  } catch {
    return null;
  }
}

export function saveTraceProviderSettings(settings: TraceProviderSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearTraceProviderSettings() {
  window.localStorage.removeItem(STORAGE_KEY);
}
