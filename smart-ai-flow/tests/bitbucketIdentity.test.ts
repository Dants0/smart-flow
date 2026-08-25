import { describe, expect, it } from 'vitest';
import { bitbucketApiIdentity } from '../src/domain/bitbucketIdentity';
import { authHeader } from '../src/infra/bitbucket';

/** Decodifica o `Basic ...` de volta pro par identidade:segredo. */
function decode(header: string): { identity: string; secret: string } {
  const [identity, secret] = Buffer.from(header.replace('Basic ', ''), 'base64')
    .toString('utf-8')
    .split(':');
  return { identity, secret };
}

const CREDS = {
  user: 'guilhermedantas1',
  email: 'guilherme.dantas@pixeon.com',
  appPassword: 'ATATT-token',
};

describe('identidade que autentica a API do Bitbucket', () => {
  it('a API usa o E-MAIL, nunca o nome de usuário', () => {
    // regra da Atlassian: API token + e-mail para as APIs, API token + nome de
    // usuário para os comandos Git. Trocar isso devolve 401 na metade das
    // operações — o push sobe e o PR não abre.
    expect(decode(authHeader(CREDS)).identity).toBe('guilherme.dantas@pixeon.com');
    expect(decode(authHeader(CREDS)).identity).not.toBe('guilhermedantas1');
  });

  it('o segredo enviado é o token, sem alteração', () => {
    expect(decode(authHeader(CREDS)).secret).toBe('ATATT-token');
  });

  it('e-mail vazio cai pro usuário — comportamento antigo, quem usa app password não quebra', () => {
    expect(bitbucketApiIdentity('guilhermedantas1', null)).toBe('guilhermedantas1');
    expect(bitbucketApiIdentity('guilhermedantas1', undefined)).toBe('guilhermedantas1');
    expect(bitbucketApiIdentity('guilhermedantas1', '')).toBe('guilhermedantas1');
  });

  it('e-mail só com espaço conta como não preenchido', () => {
    // campo esvaziado na UI chega como espaço e viraria uma identidade inválida
    expect(bitbucketApiIdentity('guilhermedantas1', '   ')).toBe('guilhermedantas1');
  });

  it('e-mail preenchido vence o usuário', () => {
    expect(bitbucketApiIdentity('guilhermedantas1', 'guilherme.dantas@pixeon.com')).toBe(
      'guilherme.dantas@pixeon.com',
    );
  });

  it('espaço em volta do e-mail não vaza pro Basic Auth', () => {
    expect(bitbucketApiIdentity('user', '  alguem@pixeon.com  ')).toBe('alguem@pixeon.com');
  });
});
