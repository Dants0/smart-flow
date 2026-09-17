import { describe, expect, it } from 'vitest';
import {
  classifyJiraLogin,
  jiraUsernameFor,
  localUsernameFromJira,
  loginRoute,
} from '../src/domain/jiraLogin';

describe('loginRoute', () => {
  it('quem ainda não tem conta entra pelo Jira', () => {
    expect(loginRoute(null)).toBe('jira');
  });

  it('conta vinculada ao Jira não aceita senha local', () => {
    // senão a tela pública de "esqueci minha senha" viraria porta de entrada
    expect(loginRoute({ jiraUser: 'guilherme.dantas' })).toBe('jira');
  });

  it('conta antiga sem Jira confere a senha local antes', () => {
    expect(loginRoute({ jiraUser: null })).toBe('local-depois-jira');
  });
});

describe('jiraUsernameFor', () => {
  it('conta vinculada manda o usuário do Jira gravado, não o que foi digitado', () => {
    expect(jiraUsernameFor({ jiraUser: 'guilherme.dantas' }, 'guilherme')).toBe('guilherme.dantas');
  });

  it('sem vínculo manda o que foi digitado, sem espaço', () => {
    expect(jiraUsernameFor(null, '  fulano.tal ')).toBe('fulano.tal');
    expect(jiraUsernameFor({ jiraUser: null }, 'fulano.tal')).toBe('fulano.tal');
  });
});

describe('classifyJiraLogin', () => {
  it('200 é sucesso', () => {
    expect(classifyJiraLogin(200, null)).toBeNull();
  });

  it('CAPTCHA pelo header, mesmo com 200', () => {
    expect(classifyJiraLogin(200, 'CAPTCHA_CHALLENGE')).toBe('CAPTCHA');
    expect(classifyJiraLogin(401, 'captcha_challenge')).toBe('CAPTCHA');
  });

  it('401 e 403 são credencial recusada', () => {
    expect(classifyJiraLogin(401, null)).toBe('UNAUTHORIZED');
    expect(classifyJiraLogin(403, null)).toBe('UNAUTHORIZED');
  });

  it('fora do ar ou URL errada não é "senha errada"', () => {
    // dizer "senha errada" aqui faria o dev redigitar e queimar tentativa no Jira
    expect(classifyJiraLogin(404, null)).toBe('UNAVAILABLE');
    expect(classifyJiraLogin(502, null)).toBe('UNAVAILABLE');
  });
});

describe('localUsernameFromJira', () => {
  it('normaliza a caixa para não duplicar a conta', () => {
    expect(localUsernameFromJira(' Guilherme.Dantas ')).toBe('guilherme.dantas');
  });
});
