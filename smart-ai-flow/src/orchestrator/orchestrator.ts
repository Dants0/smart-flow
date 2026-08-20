import { Stage, isAutomatic } from '../domain/stages';
import { moveCard, type Card } from '../domain/card';
import { AgentOutputError } from '../agents/contracts';
import { runAnalysis } from '../agents/analyzer';
import { runProposal } from '../agents/proposer';
import { analyzeTraces, type TraceProviderOverride } from '../infra/traceService';
import { recordRun } from '../infra/runRepository';
import type { LlmResult } from '../infra/llm';

/**
 * O orquestrador é o único lugar que fala com a API usando o token da
 * empresa. Ele recebe um card e o empurra pela esteira ENQUANTO o estágio
 * atual for automático (dono = IA). Ao chegar num gate humano (REVISAO),
 * ele para e devolve o card pro dev agir.
 *
 * Toda transição passa por moveCard -> vira histórico auditável, e toda
 * chamada ao LLM vira uma linha em Run -> auditoria de custo.
 */

type Persist = (card: Card) => Promise<void>;

export async function advance(
  card: Card,
  persist: Persist,
  traceProvider?: TraceProviderOverride,
): Promise<Card> {
  let current = card;

  // Enquanto o estágio atual for de IA, executa e avança.
  // NOVO é de DEV, mas é o ponto de partida: ao criar, disparamos ANALISE.
  while (current.stage === Stage.NOVO || isAutomatic(current.stage)) {
    const stageBefore = current.stage;
    try {
      current = await runStage(current, traceProvider);
      await persist(current);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'falha desconhecida';
      // Falha de contrato guarda a resposta crua: sem isso a linha em Run dizia
      // só "JSON inválido" e não sobrava com que investigar depois.
      const raw = err instanceof AgentOutputError ? `\n--- resposta do modelo ---\n${err.raw.slice(0, 2000)}` : '';
      await recordRun({
        cardId: current.id,
        stage: stageBefore,
        ok: false,
        errorMessage: message + raw,
      });
      current = moveCard(current, Stage.ERRO, 'IA', message);
      await persist(current);
      break;
    }
  }

  return current; // parou num gate humano (REVISAO) ou em ERRO
}

/** Grava o consumo do LLM na tabela Run — nunca deixa a falha de auditoria derrubar o pipeline. */
async function logUsage(cardId: string, stage: Stage, usage: LlmResult): Promise<void> {
  await recordRun({
    cardId,
    stage,
    ok: true,
    provider: usage.provider,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
}

async function runStage(card: Card, traceProvider?: TraceProviderOverride): Promise<Card> {
  switch (card.stage) {
    case Stage.NOVO: {
      // dispara a análise
      return moveCard(card, Stage.ANALISE, 'DEV', 'card criado, disparando análise');
    }

    case Stage.ANALISE: {
      // se o dev anexou trace, o app_trace (microserviço Go) roda primeiro —
      // o diagnóstico dele entra no prompt do analyzer e deixa a causa raiz mais precisa.
      // traceProvider é uma chave PESSOAL digitada na UI (ex: pra testar com OpenAI) —
      // nunca persistida no card, só usada nesta chamada.
      const withTrace =
        card.traceFiles?.length && !card.traceAnalysis
          ? {
              ...card,
              traceAnalysis: await analyzeTraces(card.traceFiles, card.rawTicket, traceProvider),
            }
          : card;

      const { output: analysis, usage, grounded } = await runAnalysis(withTrace);
      await logUsage(card.id, Stage.ANALISE, usage);

      const withAnalysis = { ...withTrace, analysis, grounded };
      return moveCard(withAnalysis, Stage.DESENVOLVIMENTO, 'IA', analysis.rootCause);
    }

    case Stage.DESENVOLVIMENTO: {
      const { output: proposal, usage } = await runProposal(card);
      await logUsage(card.id, Stage.DESENVOLVIMENTO, usage);

      const withProposal = { ...card, proposal };
      // para aqui: REVISAO é gate humano
      return moveCard(withProposal, Stage.REVISAO, 'IA', proposal.summary);
    }

    default:
      return card;
  }
}

/**
 * Ação humana: dev confirma que o cenário original não ocorre mais.
 * `resolutionText` é o que ele REALMENTE aplicou — pode divergir do diff da IA,
 * e é isso que vai pra base de conhecimento (ver promoteResolvedTicket).
 */
export function resolve(
  card: Card,
  note = 'validado pelo dev',
  resolutionText?: string,
  userId?: string,
): Card {
  const moved = moveCard(card, Stage.RESOLVIDO, 'DEV', note, userId);
  return resolutionText ? { ...moved, resolutionText } : moved;
}

/** Ação humana: dev rejeita o diff e pede nova proposta. */
export function requestNewProposal(card: Card, note: string, userId?: string): Card {
  return moveCard(card, Stage.DESENVOLVIMENTO, 'DEV', note, userId);
}

/** Ação humana: dev reprocessa um card que caiu em ERRO (ex: chave inválida na hora). */
export function retryFromError(
  card: Card,
  note = 'reprocessando após erro',
  userId?: string,
): Card {
  return moveCard(card, Stage.ANALISE, 'DEV', note, userId);
}
