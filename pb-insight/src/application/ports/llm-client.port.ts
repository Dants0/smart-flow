import type { ImageMediaType } from "../../domain/value-objects/image-media-type.js";

export interface DiagnosticImage {
  mediaType: ImageMediaType;
  /** Conteúdo do arquivo em base64, sem o prefixo `data:...;base64,`. */
  base64Data: string;
}

export interface DiagnosticContext {
  ticketText: string;
  /** Fontes concatenados do objeto + ancestrais + dependências relevantes. */
  objectContext: string;
  /** Screenshots/prints anexados como evidência visual (ex: tela com o erro). */
  images?: DiagnosticImage[];
  /** Sugestão/observação de um tech lead humano sobre o chamado, quando existir — hipótese a verificar, não fato dado. */
  techLeadComment?: string;
  /** Quantas outras ocorrências do mesmo evento vieram no contexto — liga a seção "Abrangência" da resposta. */
  siblingCount?: number;
}

export interface DiagnosisOutput {
  text: string;
  model: string;
  stopReason: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ILLMClient {
  synthesizeDiagnosis(context: DiagnosticContext): Promise<DiagnosisOutput>;
}
