/**
 * Comentários do chamado como contexto da IA.
 *
 * Motivo: o time passou a rodar uma análise prévia no n8n que publica o
 * resultado como comentário no chamado, e os líderes pediram que isso chegasse
 * à esteira. Além dela, o comentário é onde o suporte escreve o que descobriu
 * depois de abrir o chamado — passo de reprodução, base do cliente, "acontece
 * só no Oracle". Ignorar isso é jogar fora a pista mais barata que existe,
 * igual era com os prints até a sprint de 2026-08-21.
 *
 * Os comentários vão pro MESMO texto do chamado (`rawTicket`), numa seção
 * delimitada, em vez de campo novo: assim o dev vê e edita tudo no modal antes
 * de criar o card, e o texto chega sem mudança nenhuma a todo lugar que já lê o
 * chamado (analyzer, proposer, chat, busca literal, RAG, pesquisa do board).
 */

export interface JiraCommentRaw {
  author?: { displayName?: string; name?: string } | null;
  body?: string | null;
  created?: string;
}

/** Cabeçalho da seção. Os prompts citam este texto — mudar aqui é mudar lá. */
export const COMMENTS_HEADER = '--- Comentários do chamado (mais antigo primeiro) ---';

/**
 * Teto por comentário e total. A análise do n8n é longa, e chamado antigo tem
 * dezenas de "cliente retornou?" — sem teto o texto do chamado engole o
 * orçamento de prompt que o código real precisa.
 */
export const MAX_COMMENT_CHARS = 6000;
export const MAX_COMMENTS_TOTAL_CHARS = 20000;

/**
 * Comentários que a própria plataforma publicou (`buildJiraComment` e
 * `buildSupportComment`, em jiraComment.ts) ficam de fora: recriar o card de um
 * chamado já entregue faria a IA ler a própria entrega anterior como se fosse
 * relato do suporte.
 */
function isPlatformDelivery(body: string): boolean {
  return body.trimStart().startsWith('*MÓDULOS IMPACTADOS:*');
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n[... comentário cortado em ${max} caracteres]`;
}

/**
 * Formata os comentários na ordem em que foram escritos. Quando o total estoura,
 * os MAIS RECENTES ficam: a análise do n8n e o último retorno do suporte valem
 * mais que a triagem do primeiro dia.
 */
export function formatTicketComments(comments: JiraCommentRaw[]): string {
  const blocks = comments
    .filter((c) => (c.body ?? '').trim() && !isPlatformDelivery(c.body ?? ''))
    .map((c) => {
      const author = c.author?.displayName || c.author?.name || 'desconhecido';
      const when = c.created ? c.created.slice(0, 16).replace('T', ' ') : '';
      const header = `[${[author, when].filter(Boolean).join(' — ')}]`;
      return `${header}\n${truncate((c.body ?? '').trim(), MAX_COMMENT_CHARS)}`;
    });

  if (blocks.length === 0) return '';

  const kept: string[] = [];
  let total = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (total + blocks[i].length > MAX_COMMENTS_TOTAL_CHARS && kept.length > 0) break;
    kept.unshift(blocks[i]);
    total += blocks[i].length;
  }

  const omitted = blocks.length - kept.length;
  return [
    COMMENTS_HEADER,
    omitted > 0 ? `(${omitted} comentário(s) mais antigo(s) omitido(s) por tamanho)` : '',
    kept.join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n');
}
