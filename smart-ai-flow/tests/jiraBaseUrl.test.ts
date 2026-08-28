import { describe, expect, it } from 'vitest';
import { jqlFoiRecusada } from '../src/infra/jiraService';
import { normalizeBaseUrl } from '../src/infra/settingsRepository';

describe('normalizeBaseUrl', () => {
  it('tira a barra do fim', () => {
    // O caso real: com a barra, `${base}/rest/api/2/search` vira `//rest/...` e
    // o Jira Server responde `null for uri`, um 404 que parecia erro de JQL
    expect(normalizeBaseUrl('https://portalcliente.pixeon.com/')).toBe(
      'https://portalcliente.pixeon.com',
    );
    expect(normalizeBaseUrl('https://portalcliente.pixeon.com///')).toBe(
      'https://portalcliente.pixeon.com',
    );
  });

  it('não mexe na URL já correta', () => {
    expect(normalizeBaseUrl('https://portalcliente.pixeon.com')).toBe(
      'https://portalcliente.pixeon.com',
    );
  });

  it('preserva caminho de contexto, tirando só a barra final', () => {
    // Jira atrás de proxy costuma viver em /jira — a barra some, o caminho fica
    expect(normalizeBaseUrl('https://intranet.exemplo.com/jira/')).toBe(
      'https://intranet.exemplo.com/jira',
    );
  });

  it('espaço colado no fim também some', () => {
    // colar do navegador traz espaço junto, e ele quebra a URL do mesmo jeito
    expect(normalizeBaseUrl('  https://portalcliente.pixeon.com/  ')).toBe(
      'https://portalcliente.pixeon.com',
    );
  });

  it('vazio é ausência de valor, não string vazia', () => {
    expect(normalizeBaseUrl('')).toBeNull();
    expect(normalizeBaseUrl('   ')).toBeNull();
    expect(normalizeBaseUrl(null)).toBeNull();
  });
});

describe('jqlFoiRecusada', () => {
  it('400 é a consulta', () => {
    expect(jqlFoiRecusada(400)).toBe(true);
  });

  it('404 é o endereço, não a consulta', () => {
    // `null for uri: .../com//rest/api/2/search`. Marcar isso como JQL recusada
    // trancava a tela: o salvamento da URL base era bloqueado pelo erro que a
    // própria URL base causava
    expect(jqlFoiRecusada(404)).toBe(false);
  });

  it('instabilidade do servidor não é consulta recusada', () => {
    expect(jqlFoiRecusada(500)).toBe(false);
    expect(jqlFoiRecusada(502)).toBe(false);
    expect(jqlFoiRecusada(503)).toBe(false);
  });
});
