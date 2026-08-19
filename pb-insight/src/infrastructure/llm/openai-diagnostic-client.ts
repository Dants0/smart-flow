import OpenAI from "openai";
import type {
  DiagnosisOutput,
  DiagnosticContext,
  ILLMClient,
} from "../../application/ports/llm-client.port.js";
import { buildDiagnosisPrompt } from "./diagnosis-prompt.js";

const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Adapter real do ILLMClient via OpenAI SDK — alternativa mais barata ao
 * Claude para quem quer orçar/comparar antes de gastar no provedor mais caro.
 * Lê OPENAI_API_KEY do ambiente (mesma resolução de .env do
 * ClaudeDiagnosticClient — ver interfaces/cli/diagnose.command.ts).
 * Modelo default: gpt-4o-mini (barato) — override via env
 * PB_INSIGHT_OPENAI_MODEL ou passando `model` no construtor. Confira os
 * preços atuais na plataforma da OpenAI antes de trocar de modelo.
 */
export class OpenAIDiagnosticClient implements ILLMClient {
  private readonly client: OpenAI;

  constructor(private readonly model: string = process.env["PB_INSIGHT_OPENAI_MODEL"] ?? DEFAULT_MODEL) {
    this.client = new OpenAI();
  }

  async synthesizeDiagnosis(context: DiagnosticContext): Promise<DiagnosisOutput> {
    const prompt = buildDiagnosisPrompt(context);

    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      ...(context.images ?? []).map(
        (image): OpenAI.Chat.ChatCompletionContentPartImage => ({
          type: "image_url",
          image_url: { url: `data:${image.mediaType};base64,${image.base64Data}` },
        }),
      ),
      { type: "text", text: prompt },
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: "user", content }],
    });

    const choice = response.choices[0];
    const text = choice?.message?.content ?? "";

    return {
      text: text.trim(),
      model: response.model,
      stopReason: choice?.finish_reason ?? "unknown",
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
