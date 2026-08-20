import { callJsonAgent } from './jsonCall';
import { retrieveContext } from '../infra/pbInsight';
import { loadModuleContext } from '../infra/moduleContext';
import { getSettings } from '../infra/settingsRepository';
import { buildSkillSection } from '../domain/skill';
import { AnalyzerOutputSchema, type AnalyzerOutput } from './contracts';
import type { Card } from '../domain/card';
import type { LlmResult } from '../infra/llm';

export interface AnalysisResult {
  output: AnalyzerOutput;
  usage: LlmResult;
  /** false = rodou sem trecho real de código no prompt (ver pbInsight.ts) */
  grounded: boolean;
}

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

export async function runAnalysis(card: Card): Promise<AnalysisResult> {
  const moduleContext = await loadModuleContext(card.module); // CLAUDE.md do módulo
  const { skills } = await getSettings(); // skill do time (Configurações > IA)
  const { text: retrieved, grounded } = await retrieveContext(card.module, card.rawTicket); // RAG do PB Insight

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

  const { output, usage } = await callJsonAgent(AnalyzerOutputSchema, {
    system: SYSTEM + buildSkillSection(skills),
    userText: userPrompt,
    images: card.images,
    // 2000 deixava pouca folga: análise com muitos objetos afetados chegava
    // cortada e o JSON não fechava (o card ia pra ERRO sem motivo real).
    maxTokens: 4000,
  });

  return { output, usage, grounded };
}
