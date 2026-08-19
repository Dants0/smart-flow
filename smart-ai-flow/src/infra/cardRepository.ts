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
type CardRow = PrismaCard & { history: PrismaHistory[] };

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
    history: row.history
      .slice()
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map(
        (h): HistoryEntry => ({
          from: h.from as unknown as Stage,
          to: h.to as unknown as Stage,
          by: h.by as 'IA' | 'DEV',
          at: h.at.toISOString(),
          note: h.note ?? undefined,
        }),
      ),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findAllCards(): Promise<Card[]> {
  const rows = await prisma.card.findMany({
    include: { history: true },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDomain);
}

export async function findCardById(id: string): Promise<Card | null> {
  const row = await prisma.card.findUnique({ where: { id }, include: { history: true } });
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
      },
      update: {
        stage,
        images: (card.images as unknown as object) ?? undefined,
        traceFiles: (card.traceFiles as unknown as object) ?? undefined,
        analysis: (card.analysis as unknown as object) ?? undefined,
        proposal: (card.proposal as unknown as object) ?? undefined,
        traceAnalysis: (card.traceAnalysis as unknown as object) ?? undefined,
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
