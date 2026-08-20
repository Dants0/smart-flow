import { describe, expect, it } from 'vitest';
import { classifyDenial } from '../src/infra/jiraService';

describe('classifyDenial', () => {
  it('reconhece o CAPTCHA pelo header, mesmo com 200', () => {
    // Jira Server responde CAPTCHA em algumas rotas sem status de erro:
    // olhar só o status deixaria passar como sucesso
    expect(classifyDenial(200, 'CAPTCHA_CHALLENGE')).toBe('CAPTCHA');
    expect(classifyDenial(401, 'CAPTCHA_CHALLENGE')).toBe('CAPTCHA');
  });

  it('aceita o header em qualquer caixa', () => {
    expect(classifyDenial(401, 'captcha_challenge')).toBe('CAPTCHA');
  });

  it('401 sem header é credencial errada', () => {
    expect(classifyDenial(401, null)).toBe('UNAUTHORIZED');
  });

  it('não trata indisponibilidade como negação', () => {
    // 500/502/503 passa sozinho: bloquear aqui suspenderia o Jira do dev por
    // causa de instabilidade do servidor
    expect(classifyDenial(500, null)).toBeNull();
    expect(classifyDenial(502, null)).toBeNull();
    expect(classifyDenial(503, null)).toBeNull();
  });

  it('403 não é negação de credencial', () => {
    // permissão faltando no chamado específico — insistir não trava a conta
    expect(classifyDenial(403, null)).toBeNull();
  });

  it('sucesso não é negação', () => {
    expect(classifyDenial(200, null)).toBeNull();
    expect(classifyDenial(404, null)).toBeNull();
  });
});
