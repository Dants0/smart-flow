import { describe, expect, it } from 'vitest';
import { anthropicClientOptions } from '../src/infra/llm';

describe('anthropicClientOptions', () => {
  it('chave de API vai em apiKey (vira x-api-key)', () => {
    expect(anthropicClientOptions('apiKey', 'sk-ant-api-123')).toEqual({
      apiKey: 'sk-ant-api-123',
      authToken: null,
    });
  });

  it('token OAuth vai em authToken, com o beta que o /v1/messages exige', () => {
    // Sem o header `anthropic-beta: oauth-2025-04-20` o endpoint recusa o
    // Bearer — e o erro não diz que foi por causa do beta faltando
    expect(anthropicClientOptions('oauth', 'sk-ant-oat-abc')).toEqual({
      apiKey: null,
      authToken: 'sk-ant-oat-abc',
      defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
    });
  });

  it('o campo não usado vai como null explícito, nunca ausente', () => {
    // A linha que mais importa: omitir faz o SDK cair em
    // process.env.ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN, e a chave de API
    // vence o token na montagem do header. Uma variável esquecida no ambiente
    // do container sequestraria a credencial escolhida na tela
    const oauth = anthropicClientOptions('oauth', 'tok');
    expect('apiKey' in oauth).toBe(true);
    expect(oauth.apiKey).toBeNull();

    const chave = anthropicClientOptions('apiKey', 'sk');
    expect('authToken' in chave).toBe(true);
    expect(chave.authToken).toBeNull();
  });

  it('a chave não leva o beta de OAuth junto', () => {
    expect(anthropicClientOptions('apiKey', 'sk').defaultHeaders).toBeUndefined();
  });
});
