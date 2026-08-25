import { callJsonAgent } from './jsonCall';
import { retrieveContext } from '../infra/pbInsight';
import { loadModuleContext } from '../infra/moduleContext';
import { getSettings } from '../infra/settingsRepository';
import { buildSkillSection } from '../domain/skill';
import { buildTraceSection } from '../domain/traceSection';
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
- needsTrace = true só quando o que falta é EVIDÊNCIA DE EXECUÇÃO (um pbtrace
  mostrando o que aconteceu na máquina). Se o que falta é ler código, não marque
  needsTrace: liste os objetos em affectedObjects — a plataforma busca o código
  deles no repositório e entrega pro próximo estágio.
- Não invente causa raiz pra preencher espaço: análise honesta sobre o que falta
  vale mais que hipótese confiante.
- **Confira o sistema alvo antes de analisar.** Menção a SMARTWEB ou WEBLAUDOS =
  SMART Web. Menção a ATENDE, CADGF, AGENDA, PACDEL ou CIRURG sem citar
  SMARTWEB/WEBLAUDOS = SMART Desktop. Se o card estiver classificado no sistema
  errado, diga isso em reasoning[0] — a análise sai contra o codebase errado.
- Cite em affectedObjects apenas objetos que apareceram no contexto de código.
  Objeto que você supõe existir vai em reasoning como hipótese, não aqui.
- **affectedObjects tem que cobrir TODOS os objetos com o defeito, não só o
  citado no chamado.** Quando o contexto trouxer a seção "Mesmo evento em
  outros objetos (abrangência)", examine cada um: os que têm o mesmo defeito
  entram em affectedObjects com o reason dizendo que é a mesma causa raiz; os
  que já estão corretos ficam de fora, e um deles vale ser citado em reasoning
  como o padrão correto de referência. Corrigir 1 objeto quando N têm o mesmo
  defeito é entrega incompleta, não escopo enxuto.
- Aponte objetos concretos do codebase (windows, datawindows, NVOs, procedures).
- Considere diferenças entre ambientes Oracle e SQL Server quando relevante.`;

export async function runAnalysis(card: Card): Promise<AnalysisResult> {
  const moduleContext = await loadModuleContext(card.module); // CLAUDE.md do módulo
  const { skills } = await getSettings(); // skill do time (Configurações > IA)
  // A dica do dev entra na busca junto do chamado: se ele citou d_agm09tab, é
  // esse objeto que o RAG precisa procurar, não o que o texto do suporte sugere.
  const { text: retrieved, grounded } = await retrieveContext(
    card.module,
    [card.devHints ?? '', card.rawTicket].join('\n'),
  );

  const traceSection = buildTraceSection(card.traceAnalysis, 'analise');

  /*
   * O que o dev escreveu na criação do card. Vem ANTES do resto de propósito:
   * é a única parte do prompt escrita por alguém com o sistema na frente.
   */
  const hintSection = card.devHints?.trim()
    ? [
        '# Direcionamento do dev (quem abriu o card)',
        'Isto foi escrito por um desenvolvedor do time, com acesso ao sistema e ao',
        'banco. Trate como EVIDÊNCIA, não como sugestão: se ele aponta uma query,',
        'uma DataWindow ou um objeto, comece por aí. Contradizer isso exige motivo',
        'explícito no raciocínio.',
        '',
        card.devHints.trim(),
        '',
      ].join('\n')
    : '';

  const userPrompt = [
    hintSection,
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
    // Teto de saída. Já subiu duas vezes (2000 -> 4000 -> 16000) pelo mesmo
    // sintoma: análise longa chega cortada, o JSON não fecha e o card vai pra
    // ERRO por um motivo que não é erro. A última análise que passou gastou
    // 3492 dos 4000 — 87% do teto, ou seja, o próximo chamado um pouco maior
    // ia estourar de qualquer jeito. Sonnet 5 entrega bem mais que isso, e o
    // custo é por token gasto, não por teto pedido: teto alto não cobra a mais.
    maxTokens: 16000,
  });

  return { output, usage, grounded };
}
