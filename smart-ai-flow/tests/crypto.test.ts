import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'chave-de-teste-com-tamanho-suficiente';
});

const { encryptSecret, decryptSecret, hashPassword, verifyPassword } = await import(
  '../src/infra/crypto'
);

describe('crypto', () => {
  it('cifra e decifra a senha do Jira (precisa ser reversível pro Basic Auth)', () => {
    const senha = 'Pixeon2025@';
    const cifrada = encryptSecret(senha);

    expect(cifrada).not.toContain(senha);
    expect(decryptSecret(cifrada)).toBe(senha);
  });

  it('usa IV novo a cada chamada — mesma senha não gera o mesmo texto cifrado', () => {
    expect(encryptSecret('igual')).not.toBe(encryptSecret('igual'));
  });

  it('recusa payload adulterado (AES-GCM autentica)', () => {
    const cifrada = encryptSecret('segredo');
    const [iv, tag, data] = cifrada.split(':');
    const adulterado = `${iv}:${tag}:${Buffer.from('outracoisa').toString('base64')}`;

    expect(() => decryptSecret(adulterado)).toThrow();
    expect(() => decryptSecret('lixo')).toThrow();
  });

  it('hash de senha é one-way e verificável', () => {
    const stored = hashPassword('senha-do-dev');

    expect(stored).not.toContain('senha-do-dev');
    expect(verifyPassword('senha-do-dev', stored)).toBe(true);
    expect(verifyPassword('senha-errada', stored)).toBe(false);
  });

  it('mesma senha gera hashes diferentes (salt por usuário)', () => {
    expect(hashPassword('mesma')).not.toBe(hashPassword('mesma'));
  });

  it('não quebra com hash malformado', () => {
    expect(verifyPassword('x', 'sem-separador')).toBe(false);
    expect(verifyPassword('x', '')).toBe(false);
  });
});
