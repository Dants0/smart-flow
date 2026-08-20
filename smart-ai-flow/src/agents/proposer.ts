import { callLlm } from '../infra/llm';
import { retrieveContext } from '../infra/pbInsight';
import { loadModuleContext } from '../infra/moduleContext';
import { ProposerOutputSchema, parseAgentOutput, type ProposerOutput } from './contracts';
import type { Card } from '../domain/card';
import type { LlmResult } from '../infra/llm';

export interface ProposalResult {
  output: ProposerOutput;
  usage: LlmResult;
}

const SYSTEM = `Você é um desenvolvedor sênior de PowerBuilder/PFC no sistema SMART.
A causa raiz já foi levantada. Sua tarefa é propor a correção como um DIFF
que o desenvolvedor vai aplicar MANUALMENTE na branch dele. Você nunca commita.

Responda SOMENTE com um objeto JSON válido, sem markdown, neste formato:
{
  "summary": string,
  "diff": string,       // diff unificado, cirúrgico, mexendo só no necessário
  "rationale": string,
  "risks": string[],
  "testHint": string
}

Regras:
- Mudança cirúrgica. Não reescreva objetos inteiros.
- No diff, use caminhos de arquivo reais do módulo.
- Em risks, liste efeitos colaterais (Oracle vs SQL Server, INI, DataWindow).`;

export async function runProposal(card: Card): Promise<ProposalResult> {
  if (!card.analysis) {
    throw new Error('proposer: card sem análise prévia');
  }

  const moduleContext = await loadModuleContext(card.module);
  const { text: retrieved } = await retrieveContext(card.module, card.analysis.rootCause);

  const userPrompt = [
    `# Chamado ${card.jiraKey}`,
    card.rawTicket,
    '',
    '# Análise (causa raiz já validada)',
    JSON.stringify(card.analysis, null, 2),
    '',
    '# Contexto do módulo',
    moduleContext,
    '',
    '# Trechos relevantes do codebase (RAG)',
    retrieved,
  ].join('\n');

  const result = await callLlm({
    system: SYSTEM,
    userText: userPrompt,
    maxTokens: 4000,
  });

  return { output: parseAgentOutput(ProposerOutputSchema, result.text), usage: result };
}
