import { callLlm, type LlmResult } from '../infra/llm';
import { loadModuleContext } from '../infra/moduleContext';
import { gatherSourceMaterial } from '../infra/sourceExcerpts';
import { getSettings } from '../infra/settingsRepository';
import { buildSkillSection } from '../domain/skill';
import type { Card } from '../domain/card';

/**
 * Chat de dúvidas pontuais sobre a resolução de um card.
 *
 * Diferente dos outros agentes, aqui a saída é texto livre: é conversa, não
 * artefato. Por isso não passa pelo contrato Zod — mas passa pelo mesmo
 * `callLlm`, então o consumo continua auditado em `Run`.
 *
 * O contexto é o card inteiro (chamado, análise, raciocínio, proposta,
 * histórico) mais o código real dos objetos citados. Sem isso o dev teria que
 * recolar tudo a cada pergunta, que é exatamente o "chat no terminal" que a
 * plataforma existe pra substituir.
 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM = `Você é um desenvolvedor sênior de PowerBuilder/PFC no sistema SMART,
conversando com o dev que está revisando uma proposta de correção.

Como responder:
- Direto ao ponto. O dev está com o diff na tela e quer tirar UMA dúvida.
- Responda com base no material que veio no contexto: chamado, análise, proposta
  e o código real. **Se a resposta não estiver ali, diga que não sabe e diga o
  que precisaria olhar** — nunca invente nome de objeto, função ou caminho.
- Quando citar código, cite o arquivo e a linha que vieram no contexto.
- Se o dev apontar um erro na análise ou no diff, considere que ele pode estar
  certo: ele tem o sistema na frente e você não.
- Texto corrido, em português. Sem markdown pesado, sem repetir o enunciado.`;

function buildContext(card: Card, moduleContext: string, code: string): string {
  return [
    `# Chamado ${card.jiraKey} (${card.module}, estágio ${card.stage})`,
    card.rawTicket,
    '',
    ...(card.devHints?.trim()
      ? ['# Direcionamento do dev (escrito por quem abriu o card)', card.devHints.trim(), '']
      : []),
    ...(card.traceAnalysis?.length
      ? [
          '# Diagnóstico de trace',
          ...card.traceAnalysis.map((t) => `## ${t.filename}\n${t.strategicAnalysis}`),
          '',
        ]
      : []),
    ...(card.analysis
      ? [
          '# Análise (IA)',
          `Causa raiz: ${card.analysis.rootCause}`,
          `Confiança: ${card.analysis.confidence}`,
          'Raciocínio:',
          ...card.analysis.reasoning.map((r, i) => `${i + 1}. ${r}`),
          'Objetos afetados:',
          ...card.analysis.affectedObjects.map((o) => `- ${o.name} (${o.type}): ${o.reason}`),
          '',
        ]
      : []),
    ...(card.proposal
      ? [
          '# Proposta (IA)',
          card.proposal.summary,
          '',
          '## Diff proposto',
          card.proposal.diff,
          '',
          `Justificativa: ${card.proposal.rationale}`,
          `Como testar: ${card.proposal.testHint}`,
          ...(card.proposal.risks.length ? ['Riscos:', ...card.proposal.risks.map((r) => `- ${r}`)] : []),
          '',
        ]
      : []),
    ...(card.history.length
      ? [
          '# Histórico do card',
          ...card.history.map((h) => `- ${h.from} → ${h.to} (${h.by}) ${h.note ?? ''}`),
          '',
        ]
      : []),
    '# Contexto do módulo',
    moduleContext,
    '',
    '# Código real dos objetos citados',
    code,
  ].join('\n');
}

export async function answerCardQuestion(
  card: Card,
  turns: ChatTurn[],
): Promise<{ answer: string; usage: LlmResult }> {
  const [moduleContext, settings, material] = await Promise.all([
    loadModuleContext(card.module),
    getSettings(),
    gatherSourceMaterial(
      card.module,
      card.analysis?.affectedObjects.map((o) => o.name) ?? [],
      [
        card.devHints ?? '',
        card.rawTicket,
        card.analysis?.rootCause ?? '',
        ...(card.analysis?.reasoning ?? []),
      ].join('\n'),
    ),
  ]);

  const code = material.excerpts.length
    ? material.excerpts.map((e) => `## ${e.path}\n${e.content}`).join('\n\n')
    : '(nenhum trecho de código disponível — diga isso ao dev se a pergunta depender do código)';

  // A conversa vai inteira no texto: o histórico é curto (dúvidas pontuais) e
  // isso mantém uma chamada só, com o contexto do card sempre presente.
  const conversation = turns
    .map((t) => `${t.role === 'user' ? 'DEV' : 'VOCÊ'}: ${t.content}`)
    .join('\n\n');

  const result = await callLlm({
    system: SYSTEM + buildSkillSection(settings.skills),
    userText: [
      buildContext(card, moduleContext, code),
      '',
      '# Conversa',
      conversation,
      '',
      'Responda à última mensagem do DEV.',
    ].join('\n'),
    images: card.images,
    maxTokens: 2000,
  });

  return { answer: result.text.trim(), usage: result };
}
