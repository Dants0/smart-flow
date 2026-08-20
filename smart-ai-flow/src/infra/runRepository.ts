import type { Stage as PrismaStage } from '@prisma/client';
import { prisma } from './db';
import { estimateCostUsd } from './costs';
import type { Stage } from '../domain/stages';

/**
 * Auditoria de consumo. Cada chamada ao LLM (e cada falha) vira uma linha —
 * é o que sustenta a decisão de o token corporativo viver só no backend:
 * "todo run passa por este ponto, custo e uso auditáveis".
 */
export async function recordRun(input: {
  cardId: string;
  stage: Stage;
  ok: boolean;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}): Promise<void> {
  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const model = input.model ?? 'desconhecido';

  try {
    await prisma.run.create({
      data: {
        cardId: input.cardId,
        stage: input.stage as unknown as PrismaStage,
        provider: input.provider ?? 'desconhecido',
        model,
        inputTokens,
        outputTokens,
        costUsd: estimateCostUsd(model, inputTokens, outputTokens),
        ok: input.ok,
        errorMessage: input.errorMessage ?? null,
      },
    });
  } catch {
    // auditoria nunca deve derrubar o pipeline — se o insert falhar, segue o jogo
  }
}

export interface UsageSummary {
  totalRuns: number;
  failedRuns: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byModel: { model: string; runs: number; costUsd: number }[];
}

/** Consumo agregado dos últimos N dias — alimenta o painel de custo. */
export async function usageSummary(days = 30): Promise<UsageSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const runs = await prisma.run.findMany({ where: { at: { gte: since } } });

  const byModel = new Map<string, { runs: number; costUsd: number }>();
  for (const r of runs) {
    const entry = byModel.get(r.model) ?? { runs: 0, costUsd: 0 };
    entry.runs++;
    entry.costUsd += r.costUsd;
    byModel.set(r.model, entry);
  }

  return {
    totalRuns: runs.length,
    failedRuns: runs.filter((r) => !r.ok).length,
    inputTokens: runs.reduce((acc, r) => acc + r.inputTokens, 0),
    outputTokens: runs.reduce((acc, r) => acc + r.outputTokens, 0),
    costUsd: runs.reduce((acc, r) => acc + r.costUsd, 0),
    byModel: [...byModel.entries()]
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.costUsd - a.costUsd),
  };
}
