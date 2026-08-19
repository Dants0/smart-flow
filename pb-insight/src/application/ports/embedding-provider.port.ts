/** Porta para gerar embeddings de texto (busca por similaridade semântica de tickets). */
export interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>;
}
