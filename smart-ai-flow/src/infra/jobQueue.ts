import { prisma } from './db';
import { advance } from '../orchestrator/orchestrator';
import { findCardById, saveCard } from './cardRepository';
import { TransientLlmError } from './llmErrors';
import { noteOnCard } from '../domain/card';
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
 * São DOIS orçamentos, e confundi-los foi o defeito que motivou esta separação:
 *
 * - `attempts` (MAX_ATTEMPTS): falha de verdade. Três e o card vai pra ERRO.
 * - `deferrals` (MAX_DEFERRALS): espera por limite de uso do provedor de IA.
 *   Não é tentativa gasta — é a esteira sendo educada com uma cota que reabre
 *   sozinha. Só quando a espera passa de horas é que vira ERRO de fato.
 *
 * In-process de propósito: um Redis/BullMQ aqui seria mais infra pra manter num
 * cenário de um punhado de cards por dia. A migração é local a este arquivo.
 */
const MAX_ATTEMPTS = 3;
const POLL_MS = 2000;

/**
 * Quantas vezes um job pode ser adiado por limite de uso antes de desistir.
 * 20 × teto de 15min cobre com folga a janela de 5h da assinatura, que é o caso
 * concreto: com token OAuth a cota é a mesma que o dev gasta no Claude Code,
 * então bater o teto é rotina — e rotina não pode custar o card.
 */
const MAX_DEFERRALS = 20;

/** Teto de cada espera. Sem ele, um `retry-after` de horas prenderia o card sem sinal de vida. */
const MAX_ESPERA_MS = 15 * 60_000;

/** Piso: a janela de cota não reabre em segundos, e repicar a cada 2s só gera mais 429. */
const MIN_ESPERA_MS = 60_000;

/**
 * Início da nota de espera no histórico do card. Serve de chave: `noteOnCard`
 * substitui a linha anterior que comece com isto, em vez de empilhar outra.
 */
const NOTA_ESPERA = 'aguardando o limite de uso da IA reabrir';

/** Backoff quando o provedor NÃO disse quanto esperar: 1min, 2, 4, 8... até o teto. */
export function esperaDoAdiamento(deferrals: number, sugerida?: number): number {
  const backoff = MIN_ESPERA_MS * 2 ** Math.min(deferrals, 10);
  const alvo = sugerida ?? backoff;
  return Math.min(Math.max(alvo, MIN_ESPERA_MS), MAX_ESPERA_MS);
}

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
  deferrals: number;
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
 *
 * `availableAt` é o que segura um job adiado por limite de uso: ele continua
 * PENDING (a fila não o perdeu de vista), mas fica invisível ao claim até a
 * hora marcada. Ordena por ele antes de `createdAt` pra não deixar um job já
 * liberado atrás de outro mais antigo que ainda está esperando.
 */
async function claimNextJob(): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "Job"
    SET status = 'RUNNING', attempts = attempts + 1, "updatedAt" = NOW()
    WHERE id = (
      SELECT id FROM "Job"
      WHERE status = 'PENDING'
        AND ("availableAt" IS NULL OR "availableAt" <= NOW())
      ORDER BY "availableAt" ASC NULLS FIRST, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, "cardId", attempts, deferrals, payload
  `;
  return rows[0] ?? null;
}

/**
 * Reagenda o job por limite de uso do provedor, sem gastar tentativa.
 *
 * O `attempts` é devolvido (`decrement`) de propósito: o claim já o incrementou
 * ao pegar o job, e esperar uma cota reabrir não é uma tentativa fracassada. Sem
 * essa devolução, três 429 seguidos — coisa de uma tarde comum com token OAuth —
 * mandariam pra ERRO um card que só precisava de dez minutos.
 */
async function adiarPorCota(job: ClaimedJob, err: TransientLlmError): Promise<void> {
  const esperaMs = esperaDoAdiamento(job.deferrals, err.retryAfterMs);
  const volta = new Date(Date.now() + esperaMs);

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: 'PENDING',
      attempts: { decrement: 1 },
      deferrals: { increment: 1 },
      availableAt: volta,
      lastError: err.message,
    },
  });

  // A nota é ATUALIZADA a cada espera, não acumulada: uma linha só, sempre
  // dizendo a verdade do momento. Gravá-la uma vez só deixava a tela afirmando
  // "nova tentativa em 1 min" quarenta minutos depois, o que fazia a espera
  // parecer travamento — exatamente o mal-entendido que a nota vinha evitar.
  const card = await findCardById(job.cardId);
  if (card) {
    const tentativa = job.deferrals + 1;
    await saveCard(
      noteOnCard(
        card,
        `${NOTA_ESPERA} (${err.status ?? 'sem resposta'}) — ${tentativa}ª espera de ${MAX_DEFERRALS}, próxima tentativa em ${Math.round(esperaMs / 60_000)} min`,
        'IA',
        NOTA_ESPERA,
      ),
    );
  }
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

    // Limite de uso / indisponibilidade do provedor: espera e volta, com o card
    // parado onde está. Só desiste quando a espera já somou horas — aí é outra
    // coisa (cota diária esgotada, conta suspensa) e o dev precisa saber.
    if (err instanceof TransientLlmError && job.deferrals < MAX_DEFERRALS) {
      await adiarPorCota(job, err);
      return;
    }

    // `attempts` já vem incrementado pelo claim (RETURNING é pós-UPDATE),
    // então compara direto — somar 1 aqui gastaria uma tentativa a menos.
    const exhausted = job.attempts >= MAX_ATTEMPTS || err instanceof TransientLlmError;

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
        const motivo =
          err instanceof TransientLlmError
            ? `limite de uso da IA não reabriu após ${MAX_DEFERRALS} esperas: ${message}`
            : `falhou após ${MAX_ATTEMPTS} tentativas: ${message}`;
        await saveCard(moveCard(card, Stage.ERRO, 'IA', motivo));
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
  /** PENDING com hora marcada no futuro: esperando a cota da IA reabrir. */
  waiting: number;
}

export async function queueStats(): Promise<QueueStats> {
  const agora = new Date();
  const [pending, runningCount, failed, waiting] = await Promise.all([
    // "Na fila" exclui quem está esperando cota — senão o número diz que há
    // trabalho parado quando na verdade há trabalho agendado, que é outra coisa.
    prisma.job.count({
      where: { status: 'PENDING', OR: [{ availableAt: null }, { availableAt: { lte: agora } }] },
    }),
    prisma.job.count({ where: { status: 'RUNNING' } }),
    prisma.job.count({ where: { status: 'FAILED' } }),
    prisma.job.count({ where: { status: 'PENDING', availableAt: { gt: agora } } }),
  ]);
  return { pending, running: runningCount, failed, waiting };
}
