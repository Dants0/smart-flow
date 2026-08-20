import { describe, expect, it } from 'vitest';
import { createCard, moveCard, isWaitingOnDev } from '../src/domain/card';
import { Stage } from '../src/domain/stages';

function novoCard() {
  return createCard({
    id: 'card-1',
    jiraKey: 'SMART-1',
    module: 'atende',
    rawTicket: 'algo quebrou',
  });
}

describe('card', () => {
  it('nasce em NOVO, sem histórico', () => {
    const card = novoCard();
    expect(card.stage).toBe(Stage.NOVO);
    expect(card.history).toEqual([]);
  });

  it('moveCard registra a transição no histórico — base da auditoria', () => {
    const moved = moveCard(novoCard(), Stage.ANALISE, 'DEV', 'disparando');

    expect(moved.stage).toBe(Stage.ANALISE);
    expect(moved.history).toHaveLength(1);
    expect(moved.history[0]).toMatchObject({
      from: Stage.NOVO,
      to: Stage.ANALISE,
      by: 'DEV',
      note: 'disparando',
    });
  });

  it('não muta o card original (evita estado compartilhado no pipeline)', () => {
    const card = novoCard();
    moveCard(card, Stage.ANALISE, 'DEV');

    expect(card.stage).toBe(Stage.NOVO);
    expect(card.history).toHaveLength(0);
  });

  it('acumula o histórico ao longo da esteira', () => {
    let card = novoCard();
    card = moveCard(card, Stage.ANALISE, 'DEV');
    card = moveCard(card, Stage.DESENVOLVIMENTO, 'IA', 'causa raiz X');
    card = moveCard(card, Stage.REVISAO, 'IA', 'proposta Y');

    expect(card.history.map((h) => h.to)).toEqual([
      Stage.ANALISE,
      Stage.DESENVOLVIMENTO,
      Stage.REVISAO,
    ]);
  });

  it('recusa transição inválida', () => {
    expect(() => moveCard(novoCard(), Stage.RESOLVIDO, 'DEV')).toThrow(/Transição inválida/);
  });

  it('isWaitingOnDev sinaliza os gates humanos, menos o terminal', () => {
    const card = novoCard();
    expect(isWaitingOnDev({ ...card, stage: Stage.REVISAO })).toBe(true);
    expect(isWaitingOnDev({ ...card, stage: Stage.ERRO })).toBe(true);
    expect(isWaitingOnDev({ ...card, stage: Stage.ANALISE })).toBe(false);
    // RESOLVIDO é fim de linha: ninguém está esperando nada
    expect(isWaitingOnDev({ ...card, stage: Stage.RESOLVIDO })).toBe(false);
  });
});
