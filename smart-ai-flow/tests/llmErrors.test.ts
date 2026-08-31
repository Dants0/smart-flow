import { describe, expect, it } from 'vitest';
import {
  RECUSA_OAUTH,
  ehRecusaDisfarcadaDe429,
  esperaSugerida,
  headersDeCota,
  resumoDeCota,
  statusEhTransitorio,
} from '../src/infra/llmErrors';
import { esperaDoAdiamento } from '../src/infra/jobQueue';

describe('statusEhTransitorio', () => {
  it('429 é espera, não erro do card', () => {
    expect(statusEhTransitorio(429)).toBe(true);
  });

  it('5xx e o 529 da Anthropic são capacidade do provedor', () => {
    for (const s of [500, 502, 503, 504, 529]) expect(statusEhTransitorio(s)).toBe(true);
  });

  it('sem status (conexão caiu) é transitório', () => {
    expect(statusEhTransitorio(undefined)).toBe(true);
  });

  it('o 400 de saldo insuficiente NÃO é transitório', () => {
    // "Your credit balance is too low" chega como 400. Retentar isso seria
    // queimar a fila esperando um crédito que só entra por ação humana.
    expect(statusEhTransitorio(400)).toBe(false);
  });

  it('credencial errada não se resolve esperando', () => {
    expect(statusEhTransitorio(401)).toBe(false);
    expect(statusEhTransitorio(403)).toBe(false);
  });
});

describe('headersDeCota', () => {
  it('guarda retry-after e os baldes, ignora o resto', () => {
    expect(
      headersDeCota({
        'retry-after': '60',
        'anthropic-ratelimit-unified-status': 'rejected',
        'content-type': 'application/json',
        'request-id': 'req_123',
      }),
    ).toEqual({
      'retry-after': '60',
      'anthropic-ratelimit-unified-status': 'rejected',
    });
  });

  it('header ausente ou nulo não vira string vazia', () => {
    expect(headersDeCota({ 'retry-after': null })).toEqual({});
    expect(headersDeCota(undefined)).toEqual({});
  });
});

describe('esperaSugerida', () => {
  const agora = Date.parse('2026-08-31T12:00:00Z');

  it('retry-after em segundos', () => {
    expect(esperaSugerida({ 'retry-after': '90' }, agora)).toBe(90_000);
  });

  it('reset em RFC3339 (baldes por chave de API)', () => {
    expect(
      esperaSugerida({ 'anthropic-ratelimit-tokens-reset': '2026-08-31T12:05:00Z' }, agora),
    ).toBe(300_000);
  });

  it('reset em epoch de segundos (balde unificado do token OAuth)', () => {
    expect(
      esperaSugerida({ 'anthropic-ratelimit-unified-reset': String(agora / 1000 + 600) }, agora),
    ).toBe(600_000);
  });

  it('com vários baldes, espera o ÚLTIMO a reabrir', () => {
    // Esperar o que reabre primeiro só produziria outro 429 no mesmo minuto.
    expect(
      esperaSugerida(
        {
          'anthropic-ratelimit-requests-reset': '2026-08-31T12:01:00Z',
          'anthropic-ratelimit-tokens-reset': '2026-08-31T12:07:00Z',
        },
        agora,
      ),
    ).toBe(420_000);
  });

  it('sem header legível, quem chama decide o backoff', () => {
    expect(esperaSugerida({}, agora)).toBeUndefined();
    expect(esperaSugerida({ 'retry-after': 'sei lá' }, agora)).toBeUndefined();
  });

  it('reset já vencido não vira espera negativa', () => {
    expect(
      esperaSugerida({ 'anthropic-ratelimit-tokens-reset': '2026-08-31T11:59:00Z' }, agora),
    ).toBeUndefined();
  });
});

describe('resumoDeCota', () => {
  it('entra na mensagem de auditoria, que era só "429 Error"', () => {
    expect(resumoDeCota({ 'retry-after': '60' })).toBe(' [retry-after=60]');
  });

  it('sem headers, não polui a mensagem', () => {
    expect(resumoDeCota({})).toBe('');
  });
});

describe('esperaDoAdiamento', () => {
  it('respeita o que o provedor pediu', () => {
    expect(esperaDoAdiamento(0, 5 * 60_000)).toBe(5 * 60_000);
  });

  it('sem sugestão, dobra a cada espera', () => {
    expect(esperaDoAdiamento(0)).toBe(60_000);
    expect(esperaDoAdiamento(1)).toBe(120_000);
    expect(esperaDoAdiamento(2)).toBe(240_000);
  });

  it('nunca desce do minuto — repicar a cada 2s só gera outro 429', () => {
    expect(esperaDoAdiamento(0, 1_000)).toBe(60_000);
  });

  it('nunca passa de 15min, mesmo com retry-after de horas', () => {
    // Um card preso 3h sem sinal de vida é indistinguível de card travado.
    expect(esperaDoAdiamento(0, 3 * 3_600_000)).toBe(15 * 60_000);
    expect(esperaDoAdiamento(19)).toBe(15 * 60_000);
  });
});

describe('ehRecusaDisfarcadaDe429', () => {
  it('429 sem nenhum header de cota é recusa de permissão, não limite', () => {
    // Medido na conta Pixeon em 2026-08-31: 429, `"message":"Error"`, org e
    // workspace resolvidos nos headers, zero `anthropic-ratelimit-*`, e o
    // /usage marcando 0% — a chamada é barrada antes de virar consumo.
    expect(ehRecusaDisfarcadaDe429(429, {})).toBe(true);
  });

  it('429 COM balde é limite de uso de verdade, e vale esperar', () => {
    expect(ehRecusaDisfarcadaDe429(429, { 'retry-after': '60' })).toBe(false);
    expect(
      ehRecusaDisfarcadaDe429(429, { 'anthropic-ratelimit-unified-status': 'rejected' }),
    ).toBe(false);
  });

  it('5xx sem header nenhum continua sendo espera', () => {
    // Indisponibilidade não tem balde pra reportar; só o 429 é ambíguo.
    expect(ehRecusaDisfarcadaDe429(529, {})).toBe(false);
    expect(ehRecusaDisfarcadaDe429(503, {})).toBe(false);
    expect(ehRecusaDisfarcadaDe429(undefined, {})).toBe(false);
  });

  it('a mensagem diz o que trocar, não só o que falhou', () => {
    expect(RECUSA_OAUTH).toContain('sk-ant-api');
    expect(RECUSA_OAUTH).toContain('Configurações > IA');
  });
});
