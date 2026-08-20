import { describe, expect, it } from 'vitest';
import { Stage, OWNER, canTransition, assertTransition, isAutomatic } from '../src/domain/stages';

/**
 * A máquina de estados é a regra central do produto: define o que a IA pode
 * fazer sozinha e onde ela é obrigada a parar e esperar o dev.
 */
describe('stages', () => {
  it('só ANALISE e DESENVOLVIMENTO rodam sem humano', () => {
    expect(isAutomatic(Stage.ANALISE)).toBe(true);
    expect(isAutomatic(Stage.DESENVOLVIMENTO)).toBe(true);

    expect(isAutomatic(Stage.NOVO)).toBe(false);
    expect(isAutomatic(Stage.REVISAO)).toBe(false);
    expect(isAutomatic(Stage.RESOLVIDO)).toBe(false);
    expect(isAutomatic(Stage.ERRO)).toBe(false);
  });

  it('REVISAO é gate humano — a IA nunca pode resolver sozinha', () => {
    expect(OWNER[Stage.REVISAO]).toBe('DEV');
    expect(OWNER[Stage.RESOLVIDO]).toBe('DEV');
    // o caminho automático termina em REVISAO, não em RESOLVIDO
    expect(canTransition(Stage.DESENVOLVIMENTO, Stage.RESOLVIDO)).toBe(false);
    expect(canTransition(Stage.DESENVOLVIMENTO, Stage.REVISAO)).toBe(true);
  });

  it('percorre o caminho feliz inteiro', () => {
    expect(canTransition(Stage.NOVO, Stage.ANALISE)).toBe(true);
    expect(canTransition(Stage.ANALISE, Stage.DESENVOLVIMENTO)).toBe(true);
    expect(canTransition(Stage.DESENVOLVIMENTO, Stage.REVISAO)).toBe(true);
    expect(canTransition(Stage.REVISAO, Stage.RESOLVIDO)).toBe(true);
  });

  it('permite rejeitar o diff (REVISAO volta pra DESENVOLVIMENTO)', () => {
    expect(canTransition(Stage.REVISAO, Stage.DESENVOLVIMENTO)).toBe(true);
  });

  it('permite reprocessar a partir de ERRO', () => {
    expect(canTransition(Stage.ERRO, Stage.ANALISE)).toBe(true);
  });

  it('RESOLVIDO é terminal', () => {
    for (const to of Object.values(Stage)) {
      expect(canTransition(Stage.RESOLVIDO, to)).toBe(false);
    }
  });

  it('recusa pulos de etapa', () => {
    expect(canTransition(Stage.NOVO, Stage.REVISAO)).toBe(false);
    expect(canTransition(Stage.NOVO, Stage.RESOLVIDO)).toBe(false);
    expect(canTransition(Stage.ANALISE, Stage.REVISAO)).toBe(false);
  });

  it('assertTransition estoura com a transição no texto do erro', () => {
    expect(() => assertTransition(Stage.NOVO, Stage.RESOLVIDO)).toThrow(/NOVO -> RESOLVIDO/);
    expect(() => assertTransition(Stage.NOVO, Stage.ANALISE)).not.toThrow();
  });

  it('todo estágio automático tem dono IA, e vice-versa', () => {
    for (const stage of Object.values(Stage)) {
      expect(isAutomatic(stage)).toBe(OWNER[stage] === 'IA');
    }
  });
});
