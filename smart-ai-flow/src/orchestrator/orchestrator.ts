import { Stage, isAutomatic } from '../domain/stages';
import { moveCard, type Card } from '../domain/card';
import { runAnalysis } from '../agents/analyzer';
import { runProposal } from '../agents/proposer';
import { analyzeTraces, type TraceProviderOverride } from '../infra/traceService';

/**
 * O orquestrador é o único lugar que fala com a API usando o token da
 * empresa. Ele recebe um card e o empurra pela esteira ENQUANTO o estágio
 * atual for automático (dono = IA). Ao chegar num gate humano (REVISAO),
 * ele para e devolve o card pro dev agir.
 *
 * Toda transição passa por moveCard -> vira histórico auditável.
 * O persist() é injetado pra você plugar no Prisma (ou onde quiser).
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
    try {
      current = await runStage(current, traceProvider);
      await persist(current);
    } catch (err) {
      current = moveCard(
        current,
        Stage.ERRO,
        'IA',
        err instanceof Error ? err.message : 'falha desconhecida',
      );
      await persist(current);
      break;
    }
  }

  return current; // parou num gate humano (REVISAO) ou em ERRO
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

      const analysis = await runAnalysis(withTrace);
      const withAnalysis = { ...withTrace, analysis };
      return moveCard(withAnalysis, Stage.DESENVOLVIMENTO, 'IA', analysis.rootCause);
    }

    case Stage.DESENVOLVIMENTO: {
      const proposal = await runProposal(card);
      const withProposal = { ...card, proposal };
      // para aqui: REVISAO é gate humano
      return moveCard(withProposal, Stage.REVISAO, 'IA', proposal.summary);
    }

    default:
      return card;
  }
}

/** Ação humana: dev confirma que o cenário original não ocorre mais. */
export function resolve(card: Card, note = 'validado pelo dev'): Card {
  return moveCard(card, Stage.RESOLVIDO, 'DEV', note);
}

/** Ação humana: dev rejeita o diff e pede nova proposta. */
export function requestNewProposal(card: Card, note: string): Card {
  return moveCard(card, Stage.DESENVOLVIMENTO, 'DEV', note);
}

/** Ação humana: dev reprocessa um card que caiu em ERRO (ex: chave inválida na hora). */
export function retryFromError(card: Card, note = 'reprocessando após erro'): Card {
  return moveCard(card, Stage.ANALISE, 'DEV', note);
}
