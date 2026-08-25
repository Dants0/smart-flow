import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { InvalidJsonBodyError, parseJsonBody } from '../src/http/jsonBodyParser';

describe('parser de application/json', () => {
  it('corpo vazio vira objeto vazio, não erro', () => {
    // é o caso das rotas sem corpo: "Testar conexão", dispensar chamado,
    // apagar usuário. O navegador anuncia JSON mesmo sem mandar nada.
    expect(parseJsonBody('')).toEqual({});
    expect(parseJsonBody('   ')).toEqual({});
    expect(parseJsonBody(undefined)).toEqual({});
  });

  it('corpo válido continua sendo parseado normalmente', () => {
    expect(parseJsonBody('{"jiraUser":"guilherme"}')).toEqual({ jiraUser: 'guilherme' });
  });

  it('JSON malformado continua sendo 400, não 500', () => {
    // aceitar corpo vazio não pode virar desculpa pra engolir corpo quebrado
    expect(() => parseJsonBody('{ nao é json }')).toThrow(InvalidJsonBodyError);
    try {
      parseJsonBody('{');
    } catch (err) {
      expect((err as InvalidJsonBodyError).statusCode).toBe(400);
    }
  });
});

/**
 * O teste que faltava. A suíte antiga passava com o app real quebrado porque
 * `inject()` só manda content-type quando a gente manda — e é justamente o
 * header que dispara o bug.
 */
describe('rota sem corpo chamada como o navegador chama', () => {
  async function buildApp() {
    const app = Fastify();
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
      try {
        done(null, parseJsonBody(body));
      } catch (err) {
        done(err as Error, undefined);
      }
    });
    app.post('/me/bitbucket/test', async () => ({ ok: true }));
    await app.ready();
    return app;
  }

  it('POST sem corpo COM content-type json responde 200', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/bitbucket/test',
      headers: { 'content-type': 'application/json' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it('POST sem corpo e sem content-type continua respondendo 200', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/me/bitbucket/test' });

    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('POST com JSON quebrado responde 400', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/bitbucket/test',
      headers: { 'content-type': 'application/json' },
      payload: '{ quebrado',
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
