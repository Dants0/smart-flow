import type { Card } from './card';

/**
 * Comentário de entrega no Jira, no template que o time usa.
 *
 * Formatado em **wiki markup do Jira Server**: `*TÍTULO:*` sai em negrito, e
 * `!arquivo.png|thumbnail!` embute o anexo do próprio chamado. Sem os
 * asteriscos o comentário chega no Jira como um bloco de texto corrido.
 *
 * Regras que vieram do time e não são negociáveis:
 *
 *  - **OBJETOS ALTERADOS sai do commit, não do modelo.** Caminho completo, como
 *    aparece no repositório — a IA pode citar objeto que ela achou relevante e
 *    não mexeu, e comentário no Jira é registro oficial.
 *  - **CAUSA RAIZ só é preenchida se o chamado causador for conhecido.** Em
 *    branco quando não se sabe; nunca um palpite.
 *  - **EVIDÊNCIAS não é gerada.** É prova de teste executado, e a plataforma não
 *    testou nada. As sub-seções BASE LOCAL/BASE CLIENTE vêm prontas, e os
 *    anexos `ok_base_local` / `ok_base_cliente` do chamado são referenciados
 *    automaticamente quando existem — o resto é o dev que preenche.
 */
export interface JiraCommentInput {
  card: Card;
  /** Caminhos que entraram no commit. */
  files: string[];
  prUrl?: string;
  /** Chave do chamado que originou o defeito, quando conhecida. */
  rootCauseTicket?: string;
}

const SYSTEM_LABEL: Record<string, string> = {
  smartdesktop: 'SMART Desktop',
  smartweb: 'SMART Web',
};

/**
 * Módulo impactado, no vocabulário do time: `-ATENDE`, `-SMARTWEB`.
 *
 * A biblioteca do caminho é a melhor pista disponível: `ws_objects/atende50/...`
 * vira ATENDE. Sem pista, cai no nome do sistema.
 */
export function impactedModules(module: string, files: string[]): string[] {
  if (module === 'smartweb') return ['SMARTWEB'];

  const libs = new Set<string>();
  for (const file of files) {
    const parts = file.split(/[\\/]/);
    // ws_objects/<lib>/... — a biblioteca é o segundo segmento
    const lib = parts[0]?.toLowerCase() === 'ws_objects' ? parts[1] : undefined;
    if (lib) libs.add(lib.replace(/\d+$/, '').toUpperCase());
  }

  return libs.size > 0 ? [...libs] : [SYSTEM_LABEL[module] ?? module.toUpperCase()];
}

/** Anexos que o time usa como evidência, referenciados no formato do Jira. */
export function evidenceLine(card: Card, prefix: string): string {
  const attachment = card.images?.find((img) => img.name.toLowerCase().startsWith(prefix));
  return attachment ? `!${attachment.name}|thumbnail!` : '';
}

export function buildJiraComment({
  card,
  files,
  prUrl,
  rootCauseTicket,
}: JiraCommentInput): string {
  const modules = impactedModules(card.module, files)
    .map((m) => `-${m}`)
    .join('\n');

  const technical = [card.analysis?.rootCause, card.proposal?.rationale]
    .filter(Boolean)
    .join('\n\n');

  return [
    '*MÓDULOS IMPACTADOS:*',
    modules,
    '',
    '*OBJETOS ALTERADOS:*',
    files.join('\n'),
    '',
    `PR: ${prUrl ?? ''}`,
    '',
    '*DESCRIÇÃO TÉCNICA:*',
    technical,
    '',
    '*DESCRIÇÃO RESUMIDA - CASO DE TESTES:*',
    card.proposal?.testHint ?? '',
    '',
    '*CAUSA RAIZ:*',
    rootCauseTicket ? `-${rootCauseTicket}` : '',
    '',
    '*EVIDÊNCIAS:*',
    `BASE LOCAL: ${evidenceLine(card, 'ok_base_local')}`,
    `BASE CLIENTE: ${evidenceLine(card, 'ok_base_cliente')}`,
  ].join('\n');
}

/**
 * Comentário para chamado que se resolve **sem alterar código** — orientação ao
 * suporte, em linguagem não técnica. O time já escrevia isso na mão; o formato
 * é o mesmo, sem as seções que só fazem sentido com PR.
 */
export function buildSupportComment(card: Card, orientation: string): string {
  return [
    '*MÓDULOS IMPACTADOS:*',
    impactedModules(card.module, [])
      .map((m) => `-${m}`)
      .join('\n'),
    '',
    '*ORIENTAÇÃO:*',
    orientation.trim(),
    '',
    '*EVIDÊNCIAS:*',
    `BASE LOCAL: ${evidenceLine(card, 'ok_base_local')}`,
    `BASE CLIENTE: ${evidenceLine(card, 'ok_base_cliente')}`,
  ].join('\n');
}
