import OpenAI from "openai";
import type { IEmbeddingProvider } from "../../application/ports/embedding-provider.port.js";

const DEFAULT_MODEL = "text-embedding-3-small";

/**
 * Adapter real do IEmbeddingProvider via OpenAI SDK. Reaproveita a mesma
 * OPENAI_API_KEY já configurada para o OpenAIDiagnosticClient — o SPEC
 * original (§10) cogitava Voyage AI, mas isso exigiria uma terceira chave de
 * API só para embeddings; na escala atual (cadastro manual, dezenas de
 * tickets) o custo do text-embedding-3-small é desprezível (~$0.02/1M
 * tokens) e evita o cadastro extra. Documentado como desvio deliberado em
 * docs/09, mesmo espírito da troca Postgres -> JSON.
 */
export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  private client: OpenAI | null = null;

  constructor(private readonly model: string = process.env["PB_INSIGHT_EMBEDDING_MODEL"] ?? DEFAULT_MODEL) {}

  /**
   * Cliente criado sob demanda, não no construtor: o SDK exige a chave já na
   * construção, e isso derrubava o servidor inteiro na subida quando não havia
   * OPENAI_API_KEY — mesmo o embedding sendo usado só na busca por tickets
   * semelhantes. Agora quem não tem chave perde apenas essa busca, com um erro
   * que diz o que fazer, e o resto do PB Insight (busca em código, contexto de
   * objeto, diagnóstico) funciona normalmente.
   */
  private getClient(): OpenAI {
    if (!this.client) {
      if (!process.env["OPENAI_API_KEY"]) {
        throw new Error(
          "Busca por tickets semelhantes exige OPENAI_API_KEY (embeddings). Configure e reinicie o PB Insight.",
        );
      }
      this.client = new OpenAI();
    }
    return this.client;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.getClient().embeddings.create({ model: this.model, input: text });
    const vector = response.data[0]?.embedding;
    if (!vector) throw new Error("Resposta de embedding vazia da OpenAI.");
    return vector;
  }
}
