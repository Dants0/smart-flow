/**
 * Máquina de estados do card.
 *
 * A regra central do produto vive aqui: cada estágio tem um DONO
 * (IA ou DEV) e um conjunto de transições permitidas. O orquestrador
 * só executa automaticamente os estágios cujo dono é a IA; os demais
 * ficam travados esperando ação humana.
 */

export enum Stage {
  NOVO = 'NOVO',
  ANALISE = 'ANALISE',
  DESENVOLVIMENTO = 'DESENVOLVIMENTO',
  REVISAO = 'REVISAO',
  VERSIONAMENTO = 'VERSIONAMENTO', // diff aplicado: commit, push e PR na branch do chamado
  RESOLVIDO = 'RESOLVIDO',
  ERRO = 'ERRO', // estágio de exceção: análise/proposta falhou, volta pro dev
}

export type Owner = 'IA' | 'DEV';

/** Quem age em cada estágio. */
export const OWNER: Record<Stage, Owner> = {
  [Stage.NOVO]: 'DEV', // dev cola o chamado do Jira
  [Stage.ANALISE]: 'IA', // IA levanta causa raiz + raciocínio
  [Stage.DESENVOLVIMENTO]: 'IA', // IA propõe o diff
  [Stage.REVISAO]: 'DEV', // dev aplica na branch, testa, ajusta
  [Stage.VERSIONAMENTO]: 'DEV', // dev confere o que sobe, commita, abre o PR
  [Stage.RESOLVIDO]: 'DEV', // dev confirma que o cenário não ocorre mais
  [Stage.ERRO]: 'DEV',
};

/** Transições permitidas a partir de cada estágio. */
const TRANSITIONS: Record<Stage, Stage[]> = {
  [Stage.NOVO]: [Stage.ANALISE],
  // REVISAO: a análise ficou pronta mas pediu pbtrace — o orquestrador para
  // aqui em vez de propor um diff sem evidência (ver orchestrator.ts).
  [Stage.ANALISE]: [Stage.DESENVOLVIMENTO, Stage.REVISAO, Stage.ERRO],
  [Stage.DESENVOLVIMENTO]: [Stage.REVISAO, Stage.ERRO],
  // dev pode versionar (VERSIONAMENTO), aceitar direto (RESOLVIDO — correção que
  // não passa por PR) ou pedir nova proposta (DESENVOLVIMENTO)
  [Stage.REVISAO]: [Stage.VERSIONAMENTO, Stage.RESOLVIDO, Stage.DESENVOLVIMENTO],
  // PR aberto: fecha quando o dev confirma, ou volta pra proposta se o PR for recusado
  [Stage.VERSIONAMENTO]: [Stage.RESOLVIDO, Stage.DESENVOLVIMENTO],
  [Stage.RESOLVIDO]: [],
  [Stage.ERRO]: [Stage.ANALISE], // reprocessa do zero
};

export function canTransition(from: Stage, to: Stage): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: Stage, to: Stage): void {
  if (!canTransition(from, to)) {
    throw new Error(`Transição inválida: ${from} -> ${to}`);
  }
}

/** Estágios que o orquestrador roda sozinho (dono = IA). */
export function isAutomatic(stage: Stage): boolean {
  return OWNER[stage] === 'IA';
}
