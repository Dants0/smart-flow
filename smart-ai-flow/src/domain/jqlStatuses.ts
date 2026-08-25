/**
 * Lê da JQL quais situações estão sendo escondidas do aviso de chamados.
 *
 * Existe por causa de uma reclamação concreta do dev: a tela de Configurações
 * mostrava a consulta como texto cru — dez números soltos em
 * `status not in (19653, 17600, ...)` — e não havia como saber o que estava
 * filtrado sem abrir o Jira e conferir id por id.
 *
 * Só interpreta a forma negativa (`status not in (...)`, `status != x`), que é
 * a que o padrão usa. Uma JQL escrita de outro jeito devolve lista vazia, e a
 * tela simplesmente não mostra legenda — melhor não explicar do que explicar
 * errado.
 */

/** Aceita id (19653), nome com aspas ("Em revisão") ou nome solto (Entregue). */
function parseTokens(lista: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|([^,\s][^,]*?)(?=\s*,|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lista)) !== null) {
    const valor = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (valor) tokens.push(valor);
  }
  return tokens;
}

export function parseExcludedStatuses(jql: string): string[] {
  const excluidos: string[] = [];

  const notIn = /\bstatus\s+not\s+in\s*\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = notIn.exec(jql)) !== null) excluidos.push(...parseTokens(m[1]));

  // `status != X` — um de cada vez, mas aparece em JQL escrita na mão.
  const diferente = /\bstatus\s*!=\s*("([^"]*)"|'([^']*)'|[^\s)]+)/gi;
  while ((m = diferente.exec(jql)) !== null) {
    const valor = (m[2] ?? m[3] ?? m[1] ?? '').trim();
    if (valor) excluidos.push(valor);
  }

  return [...new Set(excluidos)];
}
