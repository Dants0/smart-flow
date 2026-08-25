import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentOutputError,
  AnalyzerOutputSchema,
  extractJson,
  parseAgentOutput,
  repairJsonStrings,
} from '../src/agents/contracts';
import {
  MAX_BLOCK_LINES,
  blockEnd,
  declaredAncestors,
  extractIdentifiers,
  harvestTerms,
  selectExcerpt,
} from '../src/infra/sourceExcerpts';
import { extractPhrases, phraseBackoff } from '../src/infra/pbInsight';

const ANALISE_OK = {
  rootCause: 'constraint duplicada em ate_paciente',
  reasoning: ['reproduz com pbtrace', 'checar índice'],
  affectedObjects: [{ name: 'w_atende', type: 'window', reason: 'tela do cenário' }],
  needsTrace: false,
  confidence: 'media' as const,
};

describe('extractJson', () => {
  it('ignora frase antes e depois do JSON', () => {
    const raw = `Segue a análise:\n${JSON.stringify(ANALISE_OK)}\nEspero ter ajudado.`;
    expect(JSON.parse(extractJson(raw))).toEqual(ANALISE_OK);
  });

  it('tira a cerca de markdown', () => {
    const raw = '```json\n' + JSON.stringify(ANALISE_OK) + '\n```';
    expect(JSON.parse(extractJson(raw))).toEqual(ANALISE_OK);
  });

  it('preserva crase que faz parte do conteúdo', () => {
    // o replace global de ``` mutilava JSON cujo texto citava código com crase
    const comCrase = { ...ANALISE_OK, rootCause: 'o valor de ``li_rc`` volta 0' };
    const raw = '```json\n' + JSON.stringify(comCrase) + '\n```';
    expect(JSON.parse(extractJson(raw)).rootCause).toBe('o valor de ``li_rc`` volta 0');
  });

  it('não para numa chave que está dentro de string', () => {
    const comChave = { ...ANALISE_OK, rootCause: 'o objeto {x} não existe' };
    expect(JSON.parse(extractJson(JSON.stringify(comChave)))).toEqual(comChave);
  });
});

describe('repairJsonStrings', () => {
  it('escapa quebra de linha crua dentro de string', () => {
    // a falha real de produção: "Unterminated string in JSON at position N"
    const quebrado = '{"rootCause": "linha 1\nlinha 2"}';
    expect(() => JSON.parse(quebrado)).toThrow();
    expect(JSON.parse(repairJsonStrings(quebrado)).rootCause).toBe('linha 1\nlinha 2');
  });

  it('não mexe em \\n que já vinha escapado', () => {
    const ok = '{"rootCause": "linha 1\\nlinha 2"}';
    expect(repairJsonStrings(ok)).toBe(ok);
  });

  it('não mexe em quebra de linha fora de string (indentação do JSON)', () => {
    const identado = '{\n  "a": 1\n}';
    expect(JSON.parse(repairJsonStrings(identado))).toEqual({ a: 1 });
  });

  it('escapa tab e outros controles vindos de log colado', () => {
    const comTab = '{"rootCause": "col1\tcol2"}';
    expect(JSON.parse(repairJsonStrings(comTab)).rootCause).toBe('col1\tcol2');
  });
});

describe('parseAgentOutput', () => {
  it('aceita a resposta bem formada', () => {
    expect(parseAgentOutput(AnalyzerOutputSchema, JSON.stringify(ANALISE_OK))).toEqual(ANALISE_OK);
  });

  it('recupera resposta com quebra de linha crua — o card não vai mais pra ERRO', () => {
    const raw = `{
      "rootCause": "erro na tela:
linha 2 do log",
      "reasoning": ["a"],
      "affectedObjects": [],
      "needsTrace": false,
      "confidence": "alta"
    }`;
    expect(parseAgentOutput(AnalyzerOutputSchema, raw).rootCause).toContain('linha 2 do log');
  });

  it('resposta vazia vira erro explicando o que houve', () => {
    // "Unexpected end of JSON input" não dizia nada pro dev
    expect(() => parseAgentOutput(AnalyzerOutputSchema, '')).toThrow(AgentOutputError);
    expect(() => parseAgentOutput(AnalyzerOutputSchema, '   ')).toThrow(/respondeu vazio/);
  });

  it('JSON truncado no meio não é remendado em silêncio', () => {
    const cortado = '{"rootCause": "causa", "reasoning": ["a", "b"';
    expect(() => parseAgentOutput(AnalyzerOutputSchema, cortado)).toThrow(AgentOutputError);
  });

  it('campo fora do contrato aponta qual é', () => {
    const semConfidence = { ...ANALISE_OK, confidence: 'altíssima' };
    expect(() => parseAgentOutput(AnalyzerOutputSchema, JSON.stringify(semConfidence))).toThrow(
      /confidence/,
    );
  });

  it('guarda a resposta crua no erro, pra investigar depois', () => {
    try {
      parseAgentOutput(z.object({ a: z.string() }), 'isso não é json');
      expect.unreachable();
    } catch (err) {
      expect((err as AgentOutputError).raw).toBe('isso não é json');
    }
  });
});

describe('extractIdentifiers — o que buscar no código', () => {
  it('pega identificadores no estilo PowerBuilder do texto da análise', () => {
    const ids = extractIdentifiers(
      'o ancestral u_dw_pac seta i_bAvancar via uof_testar_status() no evento avancar',
    );

    expect(ids).toContain('u_dw_pac');
    expect(ids).toContain('i_bAvancar');
    expect(ids).toContain('uof_testar_status');
    // "avancar" não tem prefixo com underscore, mas é o evento que importa
    expect(ids).toContain('avancar');
  });

  it('não devolve lista infinita — o material entra no prompt e é pago', () => {
    const texto = Array.from({ length: 50 }, (_, i) => `w_tela_${i}`).join(' ');
    expect(extractIdentifiers(texto).length).toBeLessThanOrEqual(12);
  });

  it('texto sem identificador não vira busca vazia perigosa', () => {
    expect(extractIdentifiers('o sistema trava quando o usuário confirma')).toEqual([]);
  });
});

describe('blockEnd — bloco inteiro, não janela fixa', () => {
  const FONTE = [
    'event avancar;call super::avancar;LONG nPacReg', // 0
    'nPacReg = dw_pac01tab.uof_get_pacreg ()',
    'IF nPacReg > 0 THEN',
    '   MessageBox("x","y")',
    'END IF',
    'end event', // 5
    '',
    'event buscar;call super::buscar;',
    'end event',
  ];

  it('fecha no "end event" do próprio bloco', () => {
    expect(blockEnd(FONTE, 0)).toEqual({ end: 5, truncated: false });
  });

  it('fecha também em function e subroutine', () => {
    const fn = ['public function boolean f (long x);int i', 'return true', 'end function'];
    expect(blockEnd(fn, 0).end).toBe(2);
  });

  it('bloco sem terminador é cortado E marcado como cortado', () => {
    // bloco sem "end event" passando do teto: ele age, mas quem lê precisa saber
    const enorme = [
      'event avancar;call super::avancar;',
      ...Array(MAX_BLOCK_LINES + 100).fill('  // corpo'),
    ];
    const resultado = blockEnd(enorme, 0);

    expect(resultado.truncated).toBe(true);
    expect(resultado.end).toBeLessThan(enorme.length - 1);
  });

  it('selectExcerpt entrega o evento inteiro, com o corpo onde a lógica mora', () => {
    // era o bug: janela de 90 linhas cortava o evento no meio e o modelo,
    // com razão, recusava propor por falta do trecho
    const trecho = selectExcerpt(FONTE.join('\n'), ['avancar']);

    expect(trecho).toContain('MessageBox');
    expect(trecho).toContain('end event');
  });
});

describe('busca por frase de tela (mensagem montada em runtime)', () => {
  const CHAMADO = `Ao selecionar paciente com óbito o sistema exibe
"Este paciente está registrado no sistema como Óbito. Deseja prosseguir?"
e avança mesmo respondendo Não.`;

  it('extrai a frase citada entre aspas', () => {
    expect(extractPhrases(CHAMADO)[0]).toContain('registrado no sistema como');
  });

  it('sem aspas, pega frase longa o bastante pra ser texto de tela', () => {
    const semAspas = 'O sistema informa que o paciente possui pendencia financeira aberta';
    expect(extractPhrases(semAspas).length).toBeGreaterThan(0);
  });

  it('ignora frase curta demais pra ser mensagem', () => {
    expect(extractPhrases('deu erro')).toEqual([]);
  });

  it('encurta pela direita — a cauda é a parte concatenada em runtime', () => {
    // medido no PB Insight: a frase inteira dá count 0; o prefixo acha o código
    const tentativas = phraseBackoff('Este paciente está registrado no sistema como Óbito');

    expect(tentativas[0]).toBe('Este paciente está registrado no sistema como Óbito');
    expect(tentativas).toContain('Este paciente está');
    expect(tentativas[tentativas.length - 1].split(' ')).toHaveLength(3);
  });

  it('não desce abaixo do mínimo de palavras (viraria busca genérica)', () => {
    expect(phraseBackoff('um dois')).toEqual([]);
  });
});

describe('seguir a corrente do código', () => {
  it('lê o ancestral declarado no controle', () => {
    // "type dw_pac01tab from u_dw_pac within w_x" é o que liga a tela ao
    // user object onde a lógica realmente mora
    const fonte = 'type dw_pac01tab from u_dw_pac within w_sismama_citopatologico';
    expect(declaredAncestors(fonte)).toContain('u_dw_pac');
  });

  it('ignora tipo nativo do PowerBuilder — não é objeto do repositório', () => {
    expect(declaredAncestors('global type w_x from window')).toEqual([]);
    expect(declaredAncestors('type st_1 from statictext within w_x')).toEqual([]);
  });

  it('colhe o que buscar a seguir a partir do código lido', () => {
    // o chamado dizia "avança", não "avancar", e nunca citou uof_testar_status:
    // sem colher do código, o ancestral era aberto sem se saber o que procurar
    const codigo = `event avancar;call super::avancar;
IF not This.uof_testar_status (0) THEN
   i_bavancar = FALSE
END IF`;
    const termos = harvestTerms(codigo);

    expect(termos).toContain('avancar');
    expect(termos).toContain('uof_testar_status');
    expect(termos.some((t) => /^i_bavancar$/i.test(t))).toBe(true);
  });

  it('não devolve lista infinita de termos', () => {
    const codigo = Array.from({ length: 40 }, (_, i) => `This.uof_func_${i} ()`).join('\n');
    expect(harvestTerms(codigo).length).toBeLessThanOrEqual(15);
  });
});
