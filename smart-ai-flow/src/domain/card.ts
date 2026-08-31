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
  /** Direcionamento do dev na criação: query, DataWindow, objeto suspeito. */
  devHints?: string;
  images?: CardImage[]; // screenshots anexados (erro, tela do PB)
  traceFiles?: CardTraceFile[]; // logs de trace anexados (DB/PowerBuilder)
  stage: Stage;

  analysis?: AnalyzerOutput;
  proposal?: ProposerOutput;
  traceAnalysis?: TraceFileAnalysis[]; // diagnóstico do app_trace, se houver trace anexado

  /** false = a análise rodou sem trecho real de código (pb-insight indisponível). */
  grounded?: boolean;
  /** Caminhos citados no diff que não existem no repositório — proposta a conferir. */
  unknownPaths?: string[];
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
  devHints?: string;
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

/**
 * Registra um acontecimento SEM trocar de estágio.
 *
 * Existe por causa da espera por limite de uso da IA: o card continua em
 * ANALISE/DESENVOLVIMENTO (é onde ele de fato está), mas alguém precisa
 * conseguir ver na tela por que nada acontece há dez minutos. Sem isso o card
 * parece travado, que era exatamente a confusão que ERRO evitava — ao custo de
 * exigir um clique humano pra retomar.
 *
 * Não passa por `assertTransition`: ANALISE -> ANALISE não é transição, e
 * declará-la válida abriria a porta pra laço de estágio no orquestrador.
 */
export function noteOnCard(
  card: Card,
  note: string,
  by: 'IA' | 'DEV' = 'IA',
  /**
   * Prefixo que identifica uma nota RECORRENTE: se a última entrada do histórico
   * já começa com ele, esta substitui aquela em vez de virar linha nova.
   *
   * Existe porque a primeira versão gravava a espera por cota uma vez só, e a
   * linha envelhecia na tela: depois de 50 minutos o card ainda dizia "nova
   * tentativa em 1 min". Uma nota que mente é pior que nenhuma. Vinte linhas
   * iguais também não servem — daí substituir, não acumular.
   */
  substituiPrefixo?: string,
): Card {
  const now = new Date().toISOString();
  const anterior = card.history[card.history.length - 1];
  const substitui =
    substituiPrefixo !== undefined &&
    anterior !== undefined &&
    anterior.from === anterior.to &&
    (anterior.note ?? '').startsWith(substituiPrefixo);

  const base = substitui ? card.history.slice(0, -1) : card.history;

  return {
    ...card,
    updatedAt: now,
    history: [...base, { from: card.stage, to: card.stage, by, at: now, note }],
  };
}

/** Verdadeiro se o próximo passo é humano (card travado esperando o dev). */
export function isWaitingOnDev(card: Card): boolean {
  return OWNER[card.stage] === 'DEV' && card.stage !== Stage.RESOLVIDO;
}
