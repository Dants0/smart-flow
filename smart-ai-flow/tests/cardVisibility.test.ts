import { describe, expect, it } from 'vitest';
import { podeVerCard, recorteDeDono, type Viewer } from '../src/domain/cardVisibility';

const dev: Viewer = { id: 'u-dev', isAdmin: false };
const outroDev: Viewer = { id: 'u-outro', isAdmin: false };
const admin: Viewer = { id: 'u-admin', isAdmin: true };

describe('podeVerCard', () => {
  it('deixa o dev ver o card que ele criou', () => {
    expect(podeVerCard({ createdById: 'u-dev' }, dev)).toBe(true);
  });

  it('esconde do dev o card de outra pessoa', () => {
    // O bug: conta criada pelo admin abria a plataforma e via a esteira inteira.
    expect(podeVerCard({ createdById: 'u-dev' }, outroDev)).toBe(false);
  });

  it('deixa o admin ver card de qualquer um', () => {
    expect(podeVerCard({ createdById: 'u-dev' }, admin)).toBe(true);
  });

  it('card sem dono (anterior ao multiusuário) fica só com o admin', () => {
    expect(podeVerCard({ createdById: null }, dev)).toBe(false);
    expect(podeVerCard({ createdById: undefined }, dev)).toBe(false);
    expect(podeVerCard({ createdById: null }, admin)).toBe(true);
  });

  it('não confunde dono nulo com viewer sem id', () => {
    // Guarda contra o clássico `undefined === undefined`, que daria a esteira
    // órfã inteira a qualquer conta.
    expect(podeVerCard({ createdById: undefined }, { id: undefined as never, isAdmin: false })).toBe(
      false,
    );
  });
});

describe('recorteDeDono', () => {
  it('recorta o dev no próprio id, peça ele ou não', () => {
    // `mine` é da tela; o recorte do dev é do servidor e não tem como desligar.
    expect(recorteDeDono(dev, false)).toBe('u-dev');
    expect(recorteDeDono(dev, true)).toBe('u-dev');
  });

  it('não recorta o admin por padrão', () => {
    expect(recorteDeDono(admin, false)).toBeUndefined();
  });

  it('recorta o admin quando ele pede "Meus cards"', () => {
    expect(recorteDeDono(admin, true)).toBe('u-admin');
  });
});
