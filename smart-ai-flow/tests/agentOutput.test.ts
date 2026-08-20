import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AgentOutputError,
  AnalyzerOutputSchema,
  extractJson,
  parseAgentOutput,
  repairJsonStrings,
} from '../src/agents/contracts';

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
