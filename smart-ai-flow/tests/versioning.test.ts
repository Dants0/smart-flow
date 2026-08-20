import { describe, expect, it } from 'vitest';
import {
  branchForTicket,
  commitMessage,
  parseBitbucketRepo,
  redactUrlCredentials,
} from '../src/infra/git';
import { buildJiraComment, describeObject } from '../src/domain/jiraComment';
import { Stage, canTransition } from '../src/domain/stages';
import type { Card } from '../src/domain/card';

describe('convenções do repositório', () => {
  it('branch do chamado segue bug/SMART-XXXXX', () => {
    expect(branchForTicket('SMART-50927')).toBe('bug/SMART-50927');
  });

  it('mensagem de commit segue :bug:fix SMART-XXXXX', () => {
    expect(commitMessage('SMART-50927')).toBe(':bug:fix SMART-50927');
    expect(commitMessage('SMART-50927', 'Corrige duplicidade')).toBe(
      ':bug:fix SMART-50927 Corrige duplicidade',
    );
  });

  it('resumo gigante não vira mensagem de commit gigante', () => {
    const msg = commitMessage('SMART-1', 'x'.repeat(500));
    expect(msg.length).toBeLessThan(140);
  });

  it('extrai workspace/repo da URL do Bitbucket', () => {
    expect(parseBitbucketRepo('https://user@bitbucket.org/pixeon/smart_desktop.git')).toEqual({
      workspace: 'pixeon',
      repo: 'smart_desktop',
    });
    expect(parseBitbucketRepo('git@bitbucket.org:pixeon/smart_desktop.git')).toEqual({
      workspace: 'pixeon',
      repo: 'smart_desktop',
    });
  });

  it('não confunde outro host com Bitbucket', () => {
    expect(parseBitbucketRepo('https://github.com/pixeon/smart_desktop.git')).toBeNull();
  });
});

describe('redactUrlCredentials', () => {
  it('esconde a app password que o git repete em erro de push', () => {
    const erro = 'fatal: Authentication failed for https://guilherme:s3nh4@bitbucket.org/pixeon/x.git';
    const limpo = redactUrlCredentials(erro);

    expect(limpo).not.toContain('s3nh4');
    expect(limpo).toContain('***@bitbucket.org');
  });

  it('não mexe em URL sem credencial', () => {
    const url = 'https://bitbucket.org/pixeon/smart_desktop';
    expect(redactUrlCredentials(url)).toBe(url);
  });
});

describe('máquina de estados com VERSIONAMENTO', () => {
  it('REVISAO pode versionar, resolver direto ou pedir nova proposta', () => {
    expect(canTransition(Stage.REVISAO, Stage.VERSIONAMENTO)).toBe(true);
    expect(canTransition(Stage.REVISAO, Stage.RESOLVIDO)).toBe(true);
    expect(canTransition(Stage.REVISAO, Stage.DESENVOLVIMENTO)).toBe(true);
  });

  it('VERSIONAMENTO fecha em RESOLVIDO ou volta pra proposta se o PR for recusado', () => {
    expect(canTransition(Stage.VERSIONAMENTO, Stage.RESOLVIDO)).toBe(true);
    expect(canTransition(Stage.VERSIONAMENTO, Stage.DESENVOLVIMENTO)).toBe(true);
  });

  it('não dá pra pular a revisão e cair direto no versionamento', () => {
    expect(canTransition(Stage.DESENVOLVIMENTO, Stage.VERSIONAMENTO)).toBe(false);
  });
});

describe('describeObject', () => {
  it('lê o objeto e a biblioteca do caminho do PB', () => {
    expect(describeObject('ws_objects/Atende50/atende50.pbl.src/w_atende.srw')).toBe(
      'w_atende (atende50)',
    );
  });

  it('sem biblioteca no caminho, devolve só o objeto', () => {
    expect(describeObject('qualquer/lugar/u_nv_cabecalho_t.sru')).toBe('u_nv_cabecalho_t');
  });
});

const CARD = {
  id: 'c1',
  jiraKey: 'SMART-50927',
  module: 'smartdesktop',
  rawTicket: 'texto do chamado',
  stage: Stage.VERSIONAMENTO,
  analysis: {
    rootCause: 'retorno do MessageBox não é validado',
    reasoning: [],
    affectedObjects: [],
    needsTrace: false,
    confidence: 'alta' as const,
  },
  proposal: {
    summary: 'valida o retorno',
    diff: '',
    rationale: 'sem o IF o fluxo avança de qualquer jeito',
    risks: [],
    testHint: 'abrir a AIH com paciente óbito e clicar Não',
  },
  history: [],
  createdAt: '',
  updatedAt: '',
} as unknown as Card;

describe('buildJiraComment', () => {
  const files = ['ws_objects/Mwsus50/mwsus50.pbl.src/w_aih.srw'];

  it('preenche o template do time na ordem combinada', () => {
    const texto = buildJiraComment({ card: CARD, files, prUrl: 'https://bitbucket.org/pr/1' });

    const ordem = [
      'MÓDULOS IMPACTADOS:',
      'OBJETOS ALTERADOS:',
      'PR:',
      'DESCRIÇÃO TÉCNICA:',
      'DESCRIÇÃO RESUMIDA - CASO DE TESTES:',
      'EVIDÊNCIAS:',
    ].map((t) => texto.indexOf(t));

    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it('os objetos vêm do que foi COMMITADO, não do palpite da IA', () => {
    const texto = buildJiraComment({ card: CARD, files });
    expect(texto).toContain('w_aih (mwsus50)');
  });

  it('módulo impactado usa a biblioteca do arquivo alterado', () => {
    expect(buildJiraComment({ card: CARD, files })).toContain('SMART Desktop — mwsus50');
  });

  it('EVIDÊNCIAS sai sempre em branco — a plataforma não testou nada', () => {
    const texto = buildJiraComment({ card: CARD, files, prUrl: 'https://x' });
    expect(texto.trimEnd().endsWith('EVIDÊNCIAS:')).toBe(true);
  });

  it('sem PR, a seção fica vazia em vez de inventar link', () => {
    const texto = buildJiraComment({ card: CARD, files });
    expect(texto).toMatch(/PR:\n\n/);
  });
});
