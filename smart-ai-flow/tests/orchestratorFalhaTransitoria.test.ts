import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Stage } from '../src/domain/stages';
import type { Card } from '../src/domain/card';
import { TransientLlmError } from '../src/infra/llmErrors';

const runAnalysis = vi.fn();
const recordRun = vi.fn(async () => {});

vi.mock('../src/agents/analyzer', () => ({ runAnalysis: (c: unknown) => runAnalysis(c) }));
vi.mock('../src/agents/proposer', () => ({ runProposal: vi.fn() }));
vi.mock('../src/infra/runRepository', () => ({ recordRun: (r: unknown) => recordRun(r) }));
vi.mock('../src/infra/sourceExcerpts', () => ({ gatherSourceMaterial: vi.fn() }));

const { advance } = await import('../src/orchestrator/orchestrator');

function cardEmAnalise(): Card {
  return {
    id: 'c1',
    jiraKey: 'SMART-1',
    module: 'atende',
    rawTicket: 'chamado',
    stage: Stage.ANALISE,
    grounded: true,
    history: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Card;
}

describe('advance: falha transitória do provedor', () => {
  beforeEach(() => {
    runAnalysis.mockReset();
    recordRun.mockReset();
    recordRun.mockResolvedValue(undefined);
  });

  it('429 propaga pra fila em vez de mandar o card pra ERRO', async () => {
    // A regressão que este teste trava: um limite de uso que reabre em minutos
    // parava a esteira e exigia um clique humano no reprocessar.
    runAnalysis.mockRejectedValue(new TransientLlmError('429 limite', { status: 429 }));
    const persist = vi.fn(async () => {});

    await expect(advance(cardEmAnalise(), persist)).rejects.toBeInstanceOf(TransientLlmError);

    const salvos = persist.mock.calls.map(([c]) => (c as Card).stage);
    expect(salvos).not.toContain(Stage.ERRO);
  });

  it('mesmo propagando, a chamada perdida fica auditada em Run', async () => {
    runAnalysis.mockRejectedValue(new TransientLlmError('429 limite', { status: 429 }));

    await expect(advance(cardEmAnalise(), vi.fn(async () => {}))).rejects.toThrow();

    expect(recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, stage: Stage.ANALISE }),
    );
  });

  it('falha definitiva continua indo pra ERRO', async () => {
    // O contraponto: credencial inválida não pode virar espera silenciosa.
    runAnalysis.mockRejectedValue(new Error('401 credencial inválida'));
    const persist = vi.fn(async () => {});

    const card = await advance(cardEmAnalise(), persist);

    expect(card.stage).toBe(Stage.ERRO);
  });
});
