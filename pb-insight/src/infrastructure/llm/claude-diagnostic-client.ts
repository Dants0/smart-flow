import Anthropic from "@anthropic-ai/sdk";
import type {
  DiagnosisOutput,
  DiagnosticContext,
  ILLMClient,
} from "../../application/ports/llm-client.port.js";
import { buildDiagnosisPrompt } from "./diagnosis-prompt.js";

const DEFAULT_MODEL = "claude-sonnet-5";

/**
 * Adapter real do ILLMClient via Anthropic SDK. Lê ANTHROPIC_API_KEY do
 * ambiente (ver interfaces/cli/diagnose.command.ts para a resolução do .env).
 * Modelo default: claude-sonnet-5 (custo/qualidade — não o mais caro por
 * padrão) — override via env PB_INSIGHT_MODEL ou passando `model` no construtor.
 */
export class ClaudeDiagnosticClient implements ILLMClient {
  private readonly client: Anthropic;

  constructor(private readonly model: string = process.env["PB_INSIGHT_MODEL"] ?? DEFAULT_MODEL) {
    this.client = new Anthropic();
  }

  async synthesizeDiagnosis(context: DiagnosticContext): Promise<DiagnosisOutput> {
    const prompt = buildDiagnosisPrompt(context);

    const content: Anthropic.Messages.ContentBlockParam[] = [
      ...(context.images ?? []).map(
        (image): Anthropic.Messages.ImageBlockParam => ({
          type: "image",
          source: { type: "base64", media_type: image.mediaType, data: image.base64Data },
        }),
      ),
      { type: "text", text: prompt },
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("A API recusou o diagnóstico (stop_reason: refusal).");
    }

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") {
        text += block.text + "\n";
      }
    }

    return {
      text: text.trim(),
      model: response.model,
      stopReason: response.stop_reason ?? "unknown",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
