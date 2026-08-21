import { describe, expect, it } from 'vitest';
import {
  branchForTicket,
  commitMessage,
  parseBitbucketRepo,
  redactUrlCredentials,
} from '../src/infra/git';
import {
  buildJiraComment,
  buildSupportComment,
  evidenceLine,
  impactedModules,
} from '../src/domain/jiraComment';
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

describe('impactedModules', () => {
  it('usa a biblioteca do caminho, no vocabulário do time', () => {
    expect(
      impactedModules('smartdesktop', ['ws_objects/atende50/atende50.pbl.src/w_atende.srw']),
    ).toEqual(['ATENDE']);
  });

  it('SMART Web é sempre SMARTWEB', () => {
    expect(impactedModules('smartweb', ['fontespb11/weblaudo/uof_ativar_cpw.sru'])).toEqual([
      'SMARTWEB',
    ]);
  });

  it('sem arquivo, cai no nome do sistema em vez de ficar vazio', () => {
    expect(impactedModules('smartdesktop', [])).toEqual(['SMART Desktop']);
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
  const files = ['ws_objects/mwsus/mwsus.pbl.src/w_lea_aih.srw'];

  it('preenche o template do time na ordem combinada', () => {
    const texto = buildJiraComment({ card: CARD, files, prUrl: 'https://bitbucket.org/pr/1' });

    const ordem = [
      '*MÓDULOS IMPACTADOS:*',
      '*OBJETOS ALTERADOS:*',
      'PR:',
      '*DESCRIÇÃO TÉCNICA:*',
      '*DESCRIÇÃO RESUMIDA - CASO DE TESTES:*',
      '*CAUSA RAIZ:*',
      '*EVIDÊNCIAS:*',
    ].map((t) => texto.indexOf(t));

    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it('os objetos vêm do commit, com caminho completo do repositório', () => {
    const texto = buildJiraComment({ card: CARD, files });
    expect(texto).toContain('ws_objects/mwsus/mwsus.pbl.src/w_lea_aih.srw');
  });

  it('títulos saem em negrito do wiki markup do Jira', () => {
    // sem os asteriscos o comentário chega como texto corrido
    expect(buildJiraComment({ card: CARD, files })).toContain('*DESCRIÇÃO TÉCNICA:*');
  });

  it('CAUSA RAIZ fica em branco quando o chamado causador não é conhecido', () => {
    expect(buildJiraComment({ card: CARD, files })).toMatch(/\*CAUSA RAIZ:\*\n\n/);
    expect(
      buildJiraComment({ card: CARD, files, rootCauseTicket: 'SMART-36688' }),
    ).toContain('-SMART-36688');
  });

  it('EVIDÊNCIAS traz as duas bases, vazias — a plataforma não testou nada', () => {
    const texto = buildJiraComment({ card: CARD, files, prUrl: 'https://x' });
    expect(texto).toContain('BASE LOCAL: ');
    expect(texto).toContain('BASE CLIENTE: ');
    expect(texto.trimEnd().endsWith('BASE CLIENTE:')).toBe(true);
  });

  it('anexo ok_base_local vira thumbnail na evidência', () => {
    const comAnexo = {
      ...CARD,
      images: [{ name: 'ok_base_local.png', mediaType: 'image/png', data: '' }],
    } as unknown as typeof CARD;

    expect(evidenceLine(comAnexo, 'ok_base_local')).toBe('!ok_base_local.png|thumbnail!');
    expect(buildJiraComment({ card: comAnexo, files })).toContain(
      'BASE LOCAL: !ok_base_local.png|thumbnail!',
    );
  });

  it('sem PR, a seção fica vazia em vez de inventar link', () => {
    expect(buildJiraComment({ card: CARD, files })).toContain('PR: \n');
  });
});

describe('buildSupportComment', () => {
  it('chamado sem alteração de código vira orientação, sem seções de PR', () => {
    const texto = buildSupportComment(CARD, 'Peça ao cliente que refaça o cadastro.');

    expect(texto).toContain('*ORIENTAÇÃO:*');
    expect(texto).not.toContain('PR:');
    expect(texto).not.toContain('*OBJETOS ALTERADOS:*');
  });
});

describe('needsTrace (SMART-50927)', () => {
  it('a análise pode parar em REVISAO sem passar pela proposta', () => {
    // O card real seguiu para a proposta mesmo dizendo "pede um pbtrace antes de
    // propor o diff", e o resultado foi um diff contra arquivos inventados.
    // Agora o orquestrador desvia pra REVISAO — o que exige a transição existir.
    expect(canTransition(Stage.ANALISE, Stage.REVISAO)).toBe(true);
    expect(canTransition(Stage.ANALISE, Stage.DESENVOLVIMENTO)).toBe(true);
  });
});
