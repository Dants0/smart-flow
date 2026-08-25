import { describe, expect, it } from 'vitest';
import { buildTraceSection } from '../src/domain/traceSection';
import type { TraceFileAnalysis } from '../src/domain/card';

const TRACE: TraceFileAnalysis[] = [
  {
    filename: 'pbtrace_atende.log',
    eventCount: 4127,
    strategicAnalysis: 'SELECT em pac repetido 812 vezes dentro do laço de uof_carregar.',
  },
];

describe('diagnóstico de trace no prompt', () => {
  it('sem trace anexado, não acrescenta nada ao prompt', () => {
    expect(buildTraceSection(undefined, 'analise')).toBe('');
    expect(buildTraceSection(null, 'proposta')).toBe('');
    expect(buildTraceSection([], 'analise')).toBe('');
  });

  it('leva o diagnóstico do app_trace, o arquivo e a contagem de eventos', () => {
    const section = buildTraceSection(TRACE, 'analise');

    expect(section).toContain('# Diagnóstico de trace (app_trace)');
    expect(section).toContain('pbtrace_atende.log');
    expect(section).toContain('4127 eventos');
    expect(section).toContain('SELECT em pac repetido 812 vezes');
  });

  it('inclui todos os arquivos quando há mais de um trace', () => {
    const section = buildTraceSection(
      [...TRACE, { filename: 'trace_banco.log', eventCount: 91, strategicAnalysis: 'Lock em cta.' }],
      'analise',
    );

    expect(section).toContain('pbtrace_atende.log');
    expect(section).toContain('trace_banco.log');
    expect(section).toContain('Lock em cta.');
  });

  it('na análise, orienta a cruzar o trace antes de fechar a causa raiz', () => {
    // o analyzer ainda está DECIDINDO a causa raiz — o trace é uma evidência
    // entre outras, não veredito
    const section = buildTraceSection(TRACE, 'analise');

    expect(section).toContain('evidência de execução real');
    expect(section).toContain('antes de fechar a causa raiz');
  });

  it('na proposta, proíbe reabrir a causa raiz e pede os detalhes que mudam o diff', () => {
    // o proposer recebe a causa raiz já validada; reabri-la aqui produz diff
    // contra uma teoria diferente da que o dev leu na análise
    const section = buildTraceSection(TRACE, 'proposta');

    expect(section).toContain('NÃO a reabra aqui');
    expect(section).toContain('mudam o diff');
  });

  it('na proposta, manda declarar contradição em risks em vez de propor contra o trace', () => {
    const section = buildTraceSection(TRACE, 'proposta');

    expect(section).toContain('contradisser a análise');
    expect(section).toContain('risks');
  });

  it('os dois públicos entregam o mesmo material, mudando só a instrução', () => {
    const analise = buildTraceSection(TRACE, 'analise');
    const proposta = buildTraceSection(TRACE, 'proposta');

    for (const trecho of ['pbtrace_atende.log', '4127 eventos', 'SELECT em pac repetido 812 vezes']) {
      expect(analise).toContain(trecho);
      expect(proposta).toContain(trecho);
    }
    expect(analise).not.toBe(proposta);
  });
});

describe('diagnóstico de trace no chat', () => {
  it('orienta a responder o dev sobre runtime, citando o arquivo de trace', () => {
    const section = buildTraceSection(TRACE, 'chat');

    expect(section).toContain('comportamento');
    expect(section).toContain('runtime');
    expect(section).toContain('citando o arquivo de trace');
  });

  it('manda admitir quando a pergunta não está coberta, em vez de deduzir', () => {
    // o chat responde texto livre e não passa por contrato Zod — a única
    // defesa contra invenção é a instrução
    expect(buildTraceSection(TRACE, 'chat')).toContain('em vez de deduzir');
  });

  it('o chat passa a receber a contagem de eventos, que o bloco antigo omitia', () => {
    expect(buildTraceSection(TRACE, 'chat')).toContain('4127 eventos');
  });

  it('nenhum público recebe instrução de outro', () => {
    // trocar as instruções entre si é erro de comportamento, não de estilo:
    // o proposer rediscutiria a análise que o dev acabou de ler
    const chat = buildTraceSection(TRACE, 'chat');
    const proposta = buildTraceSection(TRACE, 'proposta');
    const analise = buildTraceSection(TRACE, 'analise');

    expect(chat).not.toContain('NÃO a reabra aqui');
    expect(chat).not.toContain('antes de fechar a causa raiz');
    expect(proposta).not.toContain('antes de fechar a causa raiz');
    expect(analise).not.toContain('NÃO a reabra aqui');
  });

  it('os três públicos entregam exatamente o mesmo material', () => {
    const secoes = (['analise', 'proposta', 'chat'] as const).map((a) => buildTraceSection(TRACE, a));

    for (const secao of secoes) {
      expect(secao).toContain('pbtrace_atende.log');
      expect(secao).toContain('4127 eventos');
      expect(secao).toContain('SELECT em pac repetido 812 vezes');
    }
    expect(new Set(secoes).size).toBe(3); // mesmo material, instruções distintas
  });
});
