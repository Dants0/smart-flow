import { prisma } from './db';
import { advance } from '../orchestrator/orchestrator';
import { findCardById, saveCard } from './cardRepository';
import type { TraceProviderOverride } from './traceService';

/**
 * Fila de processamento in-process. Tira o pipeline de IA de dentro do request
 * HTTP (que ficava pendurado ~1min) e, principalmente, resolve o card zumbi:
 * antes, se o processo morresse no meio da ANALISE, o card ficava salvo naquele
 * estágio para sempre — nenhuma rota o retomava (o /retry só aceita ERRO).
 *
 * Agora todo avanço é um Job. No startup, job RUNNING órfão volta pra PENDING
 * e é reprocessado; job que estourou as tentativas manda o card pra ERRO, onde
 * o dev consegue reprocessar pela UI.
 *
 * In-process de propósito: um Redis/BullMQ aqui seria mais infra pra manter num
 * cenário de um punhado de cards por dia. A migração é local a este arquivo.
 */
const MAX_ATTEMPTS = 3;
const POLL_MS = 2000;

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function enqueueAdvance(
  cardId: string,
  traceProvider?: TraceProviderOverride,
): Promise<string> {
  const job = await prisma.job.create({
    data: {
      cardId,
      payload: (traceProvider as unknown as object) ?? undefined,
    },
  });
  return job.id;
}

interface ClaimedJob {
  id: string;
  cardId: string;
  attempts: number;
  payload: unknown;
}

/**
 * Pega o próximo job de forma ATÔMICA.
 *
 * `findFirst` + `update` separados abriam uma janela entre ler e marcar: com
 * dois workers, os dois liam o mesmo PENDING e a análise (cara) rodava duas
 * vezes pro mesmo card. Aqui o UPDATE e o SELECT são uma instrução só, e o
 * `FOR UPDATE SKIP LOCKED` faz o worker concorrente ignorar a linha travada e
 * seguir pro próximo job em vez de esperar — que é exatamente o que se quer
 * numa fila (ninguém fica bloqueado atrás de um job lento).
 */
async function claimNextJob(): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "Job"
    SET status = 'RUNNING', attempts = attempts + 1, "updatedAt" = NOW()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'PENDING'
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, "cardId", attempts, payload
  `;
  return rows[0] ?? null;
}

/** Um job por vez POR INSTÂNCIA: as chamadas de LLM são caras e sequenciais. */
async function processNext(): Promise<void> {
  const job = await claimNextJob();
  if (!job) return;

  try {
    const card = await findCardById(job.cardId);
    if (!card) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'FAILED', lastError: 'card não existe mais' },
      });
      return;
    }

    await advance(card, saveCard, (job.payload as unknown as TraceProviderOverride) ?? undefined);
    await prisma.job.update({ where: { id: job.id }, data: { status: 'DONE', lastError: null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // `attempts` já vem incrementado pelo claim (RETURNING é pós-UPDATE),
    // então compara direto — somar 1 aqui gastaria uma tentativa a menos.
    const exhausted = job.attempts >= MAX_ATTEMPTS;

    await prisma.job.update({
      where: { id: job.id },
      data: { status: exhausted ? 'FAILED' : 'PENDING', lastError: message },
    });

    // Sem tentativas restantes, o card não pode ficar presumido "em andamento":
    // manda pra ERRO, que é o estágio de onde o dev consegue reprocessar.
    if (exhausted) {
      const card = await findCardById(job.cardId);
      if (card && card.stage !== 'RESOLVIDO' && card.stage !== 'ERRO') {
        const { moveCard } = await import('../domain/card');
        const { Stage } = await import('../domain/stages');
        await saveCard(
          moveCard(card, Stage.ERRO, 'IA', `falhou após ${MAX_ATTEMPTS} tentativas: ${message}`),
        );
      }
    }
  }
}

/**
 * Recupera jobs que ficaram RUNNING quando o processo caiu. Sem isso, o card
 * fica exatamente no estado zumbi que a fila veio resolver.
 */
export async function recoverOrphanJobs(): Promise<number> {
  const { count } = await prisma.job.updateMany({
    where: { status: 'RUNNING' },
    data: { status: 'PENDING' },
  });
  return count;
}

export function startWorker(onError: (err: unknown) => void): void {
  if (timer) return;
  timer = setInterval(() => {
    if (running) return; // evita sobreposição quando um job demora mais que o poll
    running = true;
    processNext()
      .catch(onError)
      .finally(() => {
        running = false;
      });
  }, POLL_MS);
}

export function stopWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export interface QueueStats {
  pending: number;
  running: number;
  failed: number;
}

export async function queueStats(): Promise<QueueStats> {
  const [pending, runningCount, failed] = await Promise.all([
    prisma.job.count({ where: { status: 'PENDING' } }),
    prisma.job.count({ where: { status: 'RUNNING' } }),
    prisma.job.count({ where: { status: 'FAILED' } }),
  ]);
  return { pending, running: runningCount, failed };
}
