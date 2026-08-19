import { callLlm } from '../infra/llm';
import { retrieveContext } from '../infra/pbInsight';
import { loadModuleContext } from '../infra/moduleContext';
import { AnalyzerOutputSchema, parseAgentOutput, type AnalyzerOutput } from './contracts';
import type { Card } from '../domain/card';

const SYSTEM = `Você é um desenvolvedor sênior de PowerBuilder/PFC no sistema SMART.
Sua tarefa é analisar o chamado e levantar a CAUSA RAIZ, não propor código ainda.

Responda SOMENTE com um objeto JSON válido, sem markdown, sem texto fora do JSON, neste formato:
{
  "rootCause": string,
  "reasoning": string[],
  "affectedObjects": [{ "name": string, "type": string, "reason": string }],
  "needsTrace": boolean,
  "confidence": "baixa" | "media" | "alta"
}

Regras:
- Se faltar evidência de execução, marque needsTrace = true.
- Aponte objetos concretos do codebase (windows, datawindows, NVOs, procedures).
- Considere diferenças entre ambientes Oracle e SQL Server quando relevante.`;

export async function runAnalysis(card: Card): Promise<AnalyzerOutput> {
  const moduleContext = await loadModuleContext(card.module); // CLAUDE.md do módulo
  const retrieved = await retrieveContext(card.module, card.rawTicket); // RAG do PB Insight

  const traceSection = card.traceAnalysis?.length
    ? [
        '',
        '# Diagnóstico de trace (app_trace)',
        'O microserviço app_trace já processou o(s) log(s) de trace anexado(s) e chegou',
        'ao diagnóstico abaixo. Use como evidência de execução real — ela pesa mais que',
        'suposição, então cruze com o resto do contexto antes de fechar a causa raiz.',
        ...card.traceAnalysis.map(
          (t) => `\n## ${t.filename} (${t.eventCount} eventos)\n${t.strategicAnalysis}`,
        ),
      ].join('\n')
    : '';

  const userPrompt = [
    `# Chamado ${card.jiraKey}`,
    card.rawTicket,
    card.images?.length ? `\n(${card.images.length} screenshot(s) anexado(s) abaixo — use-os pra ler mensagens de erro, telas do PB e estado da UI)` : '',
    traceSection,
    '',
    '# Contexto do módulo',
    moduleContext,
    '',
    '# Trechos relevantes do codebase (RAG)',
    retrieved,
  ].join('\n');

  const text = await callLlm({
    system: SYSTEM,
    userText: userPrompt,
    images: card.images,
    maxTokens: 2000,
  });

  return parseAgentOutput(AnalyzerOutputSchema, text);
}
