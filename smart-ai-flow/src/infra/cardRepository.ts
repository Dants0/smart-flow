import type { Card as PrismaCard, History as PrismaHistory } from '@prisma/client';
import { prisma } from './db';
import type {
  Card,
  CardImage,
  CardTraceFile,
  HistoryEntry,
  TraceFileAnalysis,
} from '../domain/card';
import type { Stage } from '../domain/stages';
import type { AnalyzerOutput, ProposerOutput } from '../agents/contracts';

/**
 * Persistência real do card via Prisma/Postgres — antes era um Map em memória,
 * que perdia tudo a cada restart do processo (inclusive o `tsx watch` reiniciando
 * sozinho a cada arquivo salvo). Um card que já passou por ANALISE/DESENVOLVIMENTO
 * não pode "esquecer" e queimar tokens de novo só porque o backend reiniciou.
 */
type CardRow = PrismaCard & {
  history: (PrismaHistory & { user?: { displayName: string } | null })[];
};

function toDomain(row: CardRow): Card {
  return {
    id: row.id,
    jiraKey: row.jiraKey,
    module: row.module,
    rawTicket: row.rawTicket,
    images: (row.images as unknown as CardImage[] | null) ?? undefined,
    traceFiles: (row.traceFiles as unknown as CardTraceFile[] | null) ?? undefined,
    stage: row.stage as unknown as Stage,
    analysis: (row.analysis as unknown as AnalyzerOutput | null) ?? undefined,
    proposal: (row.proposal as unknown as ProposerOutput | null) ?? undefined,
    traceAnalysis: (row.traceAnalysis as unknown as TraceFileAnalysis[] | null) ?? undefined,
    grounded: row.grounded,
    resolutionText: row.resolutionText ?? undefined,
    createdById: row.createdById ?? undefined,
    history: row.history
      .slice()
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map(
        (h): HistoryEntry => ({
          from: h.from as unknown as Stage,
          to: h.to as unknown as Stage,
          by: h.by as 'IA' | 'DEV',
          userId: h.userId ?? undefined,
          userName: h.user?.displayName ?? undefined,
          at: h.at.toISOString(),
          note: h.note ?? undefined,
        }),
      ),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Versão enxuta do card, pro board. O `Card` completo carrega `images` em
 * base64 (até 6 × 5MB) e `traceFiles` com o log cru (até 3 × 8MB) — mandar
 * isso de todos os cards a cada polling de 5s derrubava o board bem antes de
 * chegar a 30 cards. O detalhe completo continua em GET /cards/:id, que a UI
 * já chama ao abrir o painel.
 */
export interface CardSummary {
  id: string;
  jiraKey: string;
  module: string;
  stage: Stage;
  /** Frase que o cartão exibe — proposta, causa raiz ou início do chamado. */
  preview: string;
  imageCount: number;
  traceFileCount: number;
  grounded: boolean;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CardFilters {
  /** Busca em jiraKey, texto do chamado e causa raiz. */
  search?: string;
  module?: string;
  /** Só os cards criados por este usuário. */
  createdById?: string;
  /** Corta a coluna RESOLVIDO por janela — ela cresce pra sempre e ninguém olha inteira. */
  resolvedWithinDays?: number;
}

function previewOf(row: PrismaCard, lastNote: string | null): string {
  if (row.stage === 'ERRO') return lastNote ?? 'Falha desconhecida';
  const proposal = row.proposal as { summary?: string } | null;
  if (proposal?.summary) return proposal.summary;
  const analysis = row.analysis as { rootCause?: string } | null;
  if (analysis?.rootCause) return analysis.rootCause;
  return row.rawTicket.slice(0, 240);
}

export async function findCardSummaries(filters: CardFilters = {}): Promise<CardSummary[]> {
  const where: Record<string, unknown> = {};

  if (filters.module) where.module = filters.module;
  if (filters.createdById) where.createdById = filters.createdById;

  if (filters.search) {
    const search = filters.search.trim();
    where.OR = [
      { jiraKey: { contains: search, mode: 'insensitive' } },
      { rawTicket: { contains: search, mode: 'insensitive' } },
      { resolutionText: { contains: search, mode: 'insensitive' } },
    ];
  }

  // A janela só poda RESOLVIDO: os demais estágios são trabalho em aberto e
  // devem aparecer sempre, por mais antigos que sejam.
  if (filters.resolvedWithinDays !== undefined) {
    const since = new Date(Date.now() - filters.resolvedWithinDays * 86_400_000);
    where.NOT = { AND: [{ stage: 'RESOLVIDO' }, { updatedAt: { lt: since } }] };
  }

  const rows = await prisma.card.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      jiraKey: true,
      module: true,
      stage: true,
      rawTicket: true,
      analysis: true,
      proposal: true,
      images: true,
      traceFiles: true,
      grounded: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
      history: { orderBy: { at: 'desc' }, take: 1, select: { note: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    jiraKey: row.jiraKey,
    module: row.module,
    stage: row.stage as unknown as Stage,
    preview: previewOf(row as unknown as PrismaCard, row.history[0]?.note ?? null),
    imageCount: ((row.images as unknown as unknown[] | null) ?? []).length,
    traceFileCount: ((row.traceFiles as unknown as unknown[] | null) ?? []).length,
    grounded: row.grounded,
    createdById: row.createdById ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** Módulos que de fato têm card — alimenta o seletor de filtro. */
export async function findUsedModules(): Promise<string[]> {
  const rows = await prisma.card.findMany({ distinct: ['module'], select: { module: true } });
  return rows.map((r) => r.module).sort();
}

export async function findCardById(id: string): Promise<Card | null> {
  const row = await prisma.card.findUnique({
    where: { id },
    include: { history: { include: { user: { select: { displayName: true } } } } },
  });
  return row ? toDomain(row) : null;
}

/** Só as jiraKeys já viradas card — usado pra filtrar o aviso de "atribuído a você". */
export async function findAllJiraKeys(): Promise<string[]> {
  const rows = await prisma.card.findMany({ select: { jiraKey: true } });
  return rows.map((r) => r.jiraKey);
}

/**
 * Upsert do card + substitui o histórico inteiro. O histórico é pequeno
 * (algumas entradas por card), então apagar-e-recriar é mais simples e tão
 * correto quanto tentar diffar incrementalmente.
 */
export async function saveCard(card: Card): Promise<void> {
  const stage = card.stage as unknown as PrismaCard['stage'];

  await prisma.$transaction([
    prisma.card.upsert({
      where: { id: card.id },
      create: {
        id: card.id,
        jiraKey: card.jiraKey,
        module: card.module,
        rawTicket: card.rawTicket,
        images: (card.images as unknown as object) ?? undefined,
        traceFiles: (card.traceFiles as unknown as object) ?? undefined,
        stage,
        analysis: (card.analysis as unknown as object) ?? undefined,
        proposal: (card.proposal as unknown as object) ?? undefined,
        traceAnalysis: (card.traceAnalysis as unknown as object) ?? undefined,
        grounded: card.grounded ?? true,
        resolutionText: card.resolutionText ?? null,
        createdById: card.createdById ?? null,
      },
      update: {
        stage,
        images: (card.images as unknown as object) ?? undefined,
        traceFiles: (card.traceFiles as unknown as object) ?? undefined,
        analysis: (card.analysis as unknown as object) ?? undefined,
        proposal: (card.proposal as unknown as object) ?? undefined,
        traceAnalysis: (card.traceAnalysis as unknown as object) ?? undefined,
        grounded: card.grounded ?? true,
        resolutionText: card.resolutionText ?? null,
      },
    }),
    prisma.history.deleteMany({ where: { cardId: card.id } }),
    ...(card.history.length > 0
      ? [
          prisma.history.createMany({
            data: card.history.map((h) => ({
              cardId: card.id,
              from: h.from as unknown as PrismaCard['stage'],
              to: h.to as unknown as PrismaCard['stage'],
              by: h.by,
              userId: h.userId ?? null,
              note: h.note,
              at: new Date(h.at),
            })),
          }),
        ]
      : []),
  ]);
}

export async function deleteCard(id: string): Promise<boolean> {
  try {
    await prisma.card.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}
