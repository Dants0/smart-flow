import { Stage, assertTransition, OWNER } from './stages';
import type { AnalyzerOutput, ProposerOutput } from '../agents/contracts';

/** Screenshot anexado ao chamado (print de erro, tela do PB) — vai pro prompt como imagem. */
export interface CardImage {
  name: string;
  mediaType: string; // ex: 'image/png'
  data: string; // base64, sem o prefixo "data:"
}

/** Log de trace (DB/PowerBuilder) anexado ao chamado — processado pelo microserviço app_trace. */
export interface CardTraceFile {
  name: string;
  content: string; // texto bruto do arquivo de trace
}

/** Diagnóstico estratégico que o app_trace devolve por arquivo de trace analisado. */
export interface TraceFileAnalysis {
  filename: string;
  eventCount: number;
  strategicAnalysis: string;
}

/** Uma entrada no histórico do card — tudo é auditável. */
export interface HistoryEntry {
  from: Stage;
  to: Stage;
  by: 'IA' | 'DEV';
  /** Qual dev — ausente quando a transição foi da IA. */
  userId?: string;
  userName?: string;
  at: string; // ISO
  note?: string;
}

/**
 * O card é a unidade de trabalho da esteira. Ele carrega:
 *  - a referência do chamado (Jira key + texto bruto)
 *  - o módulo alvo (define qual CLAUDE.md e qual escopo de RAG usar)
 *  - os artefatos que a IA produziu (análise, proposta de diff)
 *  - o histórico completo de transições (auditoria/governança)
 */
export interface Card {
  id: string;
  jiraKey: string;
  module: string; // ex: 'smartweb'
  rawTicket: string; // texto colado do Jira
  images?: CardImage[]; // screenshots anexados (erro, tela do PB)
  traceFiles?: CardTraceFile[]; // logs de trace anexados (DB/PowerBuilder)
  stage: Stage;

  analysis?: AnalyzerOutput;
  proposal?: ProposerOutput;
  traceAnalysis?: TraceFileAnalysis[]; // diagnóstico do app_trace, se houver trace anexado

  /** false = a análise rodou sem trecho real de código (pb-insight indisponível). */
  grounded?: boolean;
  /** O que o dev REALMENTE aplicou — pode divergir do diff proposto pela IA. */
  resolutionText?: string;

  /** Quando o diff foi escrito no working copy (ação do dev em REVISAO). */
  appliedAt?: string;
  /** Arquivos alterados pelo apply, relativos à raiz do working copy. */
  appliedFiles?: string[];
  /** Backup dos arquivos antes do apply — é o que permite reverter pela UI. */
  appliedBackupDir?: string;

  /** Versionamento: o que foi de fato pro repositório e pro Jira. */
  branch?: string;
  commitHash?: string;
  committedFiles?: string[];
  prUrl?: string;
  jiraCommentAt?: string;
  createdById?: string;

  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export function createCard(input: {
  id: string;
  jiraKey: string;
  module: string;
  rawTicket: string;
  images?: CardImage[];
  traceFiles?: CardTraceFile[];
  createdById?: string;
}): Card {
  const now = new Date().toISOString();
  return {
    ...input,
    stage: Stage.NOVO,
    history: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Move o card de estágio validando a transição e registrando no histórico.
 * `userId` identifica QUAL dev agiu (omitido quando quem age é a IA).
 */
export function moveCard(
  card: Card,
  to: Stage,
  by: 'IA' | 'DEV',
  note?: string,
  userId?: string,
): Card {
  assertTransition(card.stage, to);
  const now = new Date().toISOString();
  return {
    ...card,
    stage: to,
    updatedAt: now,
    history: [...card.history, { from: card.stage, to, by, at: now, note, userId }],
  };
}

/** Verdadeiro se o próximo passo é humano (card travado esperando o dev). */
export function isWaitingOnDev(card: Card): boolean {
  return OWNER[card.stage] === 'DEV' && card.stage !== Stage.RESOLVIDO;
}
