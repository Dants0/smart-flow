import { describe, expect, it } from 'vitest';
import { createCard, moveCard, noteOnCard, isWaitingOnDev } from '../src/domain/card';
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

describe('noteOnCard', () => {
  it('registra sem trocar de estágio', () => {
    const card = moveCard(novoCard(), Stage.ANALISE, 'DEV');
    const anotado = noteOnCard(card, 'aguardando o limite de uso da IA reabrir');

    expect(anotado.stage).toBe(Stage.ANALISE);
    expect(anotado.history).toHaveLength(2);
    expect(anotado.history[1]).toMatchObject({
      from: Stage.ANALISE,
      to: Stage.ANALISE,
      by: 'IA',
      note: 'aguardando o limite de uso da IA reabrir',
    });
  });

  it('não passa pela validação de transição', () => {
    // ANALISE -> ANALISE não é transição válida, e não deve virar uma: declarar
    // isso no TRANSITIONS abriria caminho pra laço de estágio no orquestrador.
    const card = moveCard(novoCard(), Stage.ANALISE, 'DEV');
    expect(() => moveCard(card, Stage.ANALISE, 'IA')).toThrow(/Transição inválida/);
    expect(() => noteOnCard(card, 'ok')).not.toThrow();
  });
});

describe('noteOnCard: nota recorrente', () => {
  const ESPERA = 'aguardando o limite de uso da IA reabrir';

  it('substitui a nota anterior de mesmo prefixo em vez de empilhar', () => {
    // A linha da tela precisa dizer a verdade do momento: a primeira versão
    // gravava uma vez só e, 50min depois, o card ainda anunciava "em 1 min".
    const card = moveCard(novoCard(), Stage.ANALISE, 'DEV');
    const um = noteOnCard(card, `${ESPERA} — próxima em 1 min`, 'IA', ESPERA);
    const dois = noteOnCard(um, `${ESPERA} — próxima em 15 min`, 'IA', ESPERA);

    expect(dois.history).toHaveLength(2);
    expect(dois.history[1].note).toContain('15 min');
  });

  it('não engole a transição que veio antes', () => {
    const card = moveCard(novoCard(), Stage.ANALISE, 'DEV');
    const anotado = noteOnCard(card, `${ESPERA} — próxima em 1 min`, 'IA', ESPERA);

    expect(anotado.history[0]).toMatchObject({ from: Stage.NOVO, to: Stage.ANALISE });
  });

  it('sem prefixo, continua acumulando', () => {
    const card = moveCard(novoCard(), Stage.ANALISE, 'DEV');
    const dois = noteOnCard(noteOnCard(card, 'a'), 'b');

    expect(dois.history).toHaveLength(3);
  });

  it('nota de outro assunto não é substituída', () => {
    const card = moveCard(novoCard(), Stage.ANALISE, 'DEV');
    const outra = noteOnCard(card, 'outra coisa qualquer');
    const espera = noteOnCard(outra, `${ESPERA} — próxima em 1 min`, 'IA', ESPERA);

    expect(espera.history).toHaveLength(3);
  });
});
