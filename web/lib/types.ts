export type Stage =
  | "NOVO"
  | "ANALISE"
  | "DESENVOLVIMENTO"
  | "REVISAO"
  | "RESOLVIDO"
  | "ERRO";

export type Owner = "IA" | "DEV";

export const STAGES: Stage[] = [
  "NOVO",
  "ANALISE",
  "DESENVOLVIMENTO",
  "REVISAO",
  "RESOLVIDO",
  "ERRO",
];

export const STAGE_OWNER: Record<Stage, Owner> = {
  NOVO: "DEV",
  ANALISE: "IA",
  DESENVOLVIMENTO: "IA",
  REVISAO: "DEV",
  RESOLVIDO: "DEV",
  ERRO: "DEV",
};

export const STAGE_LABEL: Record<Stage, string> = {
  NOVO: "Novo",
  ANALISE: "Análise",
  DESENVOLVIMENTO: "Desenvolvimento",
  REVISAO: "Revisão",
  RESOLVIDO: "Resolvido",
  ERRO: "Erro",
};

export interface CardImage {
  name: string;
  mediaType: string; // ex: image/png
  data: string; // base64, sem o prefixo "data:"
}

export interface CardTraceFile {
  name: string;
  content: string; // texto bruto do log de trace
}

export interface TraceFileAnalysis {
  filename: string;
  eventCount: number;
  strategicAnalysis: string;
}

export interface AffectedObject {
  name: string;
  type: string;
  reason: string;
}

export interface AnalyzerOutput {
  rootCause: string;
  reasoning: string[];
  affectedObjects: AffectedObject[];
  needsTrace: boolean;
  confidence: "baixa" | "media" | "alta";
}

export interface ProposerOutput {
  summary: string;
  diff: string;
  rationale: string;
  risks: string[];
  testHint: string;
}

export interface HistoryEntry {
  from: Stage;
  to: Stage;
  by: Owner;
  /** Qual dev agiu — ausente quando a transição foi da IA. */
  userId?: string;
  userName?: string;
  at: string;
  note?: string;
}

export interface JiraIssuePreview {
  rawTicket: string;
  images: CardImage[];
  traceFiles: CardTraceFile[];
}

export interface Card {
  id: string;
  jiraKey: string;
  module: string;
  rawTicket: string;
  images?: CardImage[];
  traceFiles?: CardTraceFile[];
  stage: Stage;
  analysis?: AnalyzerOutput;
  proposal?: ProposerOutput;
  traceAnalysis?: TraceFileAnalysis[];
  /** false = a análise rodou sem trecho real de código (pb-insight indisponível). */
  grounded?: boolean;
  /** O que o dev realmente aplicou — vai pra base de conhecimento no RESOLVIDO. */
  resolutionText?: string;
  /** Quando a IA escreveu o diff no working copy (ação do dev em REVISAO). */
  appliedAt?: string;
  /** Arquivos alterados pelo apply, relativos à raiz do working copy. */
  appliedFiles?: string[];
  appliedBackupDir?: string;
  createdById?: string;
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}
