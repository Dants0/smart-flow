import type { TraceFileAnalysis } from './card';

/**
 * Bloco do diagnóstico de trace que vai no prompt dos agentes.
 *
 * O que entra aqui NÃO é o log bruto: é o `strategicAnalysis` que o app_trace
 * (microserviço Go) já produziu, com o SQL normalizado, execuções agrupadas por
 * hash, médias reais e severidade classificada. O log pode ter gigabytes; o
 * diagnóstico cabe no prompt.
 *
 * Existe como função compartilhada porque o mesmo material serve aos dois
 * agentes com propósitos diferentes — e porque manter duas cópias do texto foi
 * exatamente o que deixou o proposer sem o trace por engano (o analyzer tinha o
 * bloco inline; o proposer, não). Mesma classe de falha que os screenshots já
 * tiveram: contexto que um agente enxerga e o outro não.
 */
export type TraceAudience = 'analise' | 'proposta' | 'chat';

/**
 * Mesmo material, instrução por papel: o analyzer ainda DECIDE a causa raiz, o
 * proposer já a recebeu fechada e escreve o diff, e o chat só responde dúvida
 * do dev. Trocar essas instruções entre si produz erro de comportamento —
 * proposer rediscutindo a análise que o dev acabou de ler, por exemplo.
 */
const INSTRUCAO: Record<TraceAudience, string[]> = {
  analise: [
    'O microserviço app_trace já processou o(s) log(s) de trace anexado(s) e chegou',
    'ao diagnóstico abaixo. Use como evidência de execução real — ela pesa mais que',
    'suposição, então cruze com o resto do contexto antes de fechar a causa raiz.',
  ],
  proposta: [
    'O microserviço app_trace processou o(s) log(s) de trace anexado(s) ao chamado.',
    'A causa raiz já foi fechada pela análise acima — NÃO a reabra aqui. Use o',
    'diagnóstico abaixo para os detalhes de execução que mudam o diff: em que ponto',
    'do fluxo o erro aparece, qual comando repete, o que roda antes do trecho que',
    'você vai alterar. Se o trace contradisser a análise, diga isso em risks em vez',
    'de propor um diff contra a evidência de execução.',
  ],
  chat: [
    'O microserviço app_trace processou o(s) log(s) anexado(s) ao chamado. É o registro',
    'do que aconteceu na execução real: use-o para responder o dev sobre comportamento',
    'em runtime, citando o arquivo de trace. Se a pergunta dele não estiver coberta',
    'pelo que está aqui, diga isso em vez de deduzir.',
  ],
};

export function buildTraceSection(
  traces: TraceFileAnalysis[] | null | undefined,
  audience: TraceAudience,
): string {
  if (!traces?.length) return '';

  return [
    '',
    '# Diagnóstico de trace (app_trace)',
    ...INSTRUCAO[audience],
    ...traces.map((t) => `\n## ${t.filename} (${t.eventCount} eventos)\n${t.strategicAnalysis}`),
  ].join('\n');
}
