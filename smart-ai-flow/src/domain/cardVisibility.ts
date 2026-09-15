/**
 * Quem enxerga qual card.
 *
 * O board é **pessoal**: cada dev lista, abre e mexe só nos cards que ele mesmo
 * criou. Até aqui a esteira era um mural compartilhado — uma conta recém-criada
 * pelo admin abria a plataforma e via o chamado, o trace, o diff e o histórico
 * de todo mundo. Card carrega texto de chamado de cliente, caminho de arquivo e
 * código proposto; não é material de mural.
 *
 * **Admin enxerga a esteira inteira.** É quem cria as contas e responde pela
 * plataforma, e é a mesma régua que `DELETE /cards/:id` já aplicava sozinho
 * ("só quem criou o card, ou um admin") — agora ela vale para ver, não só para
 * apagar.
 *
 * A regra mora aqui, e não na rota, por dois motivos: ela é a mesma na lista e
 * no acesso por id (foi justamente a lista estar filtrada e o id não que
 * deixava a esteira alheia a um `GET /cards/<uuid>` de distância), e assim ela
 * é testável sem subir Fastify.
 */

export interface Viewer {
  id: string;
  isAdmin: boolean;
}

/**
 * Card sem `createdById` — anterior ao multiusuário — fica só com o admin: não
 * há a quem atribuí-lo, e sumir do board de todo mundo é pior do que aparecer
 * para quem administra.
 */
export function podeVerCard(card: { createdById?: string | null }, viewer: Viewer): boolean {
  return viewer.isAdmin || (!!card.createdById && card.createdById === viewer.id);
}

/**
 * O `createdById` que a listagem deve usar — `undefined` significa "sem
 * recorte", e só o admin chega nesse caso.
 *
 * Para o dev o recorte é a regra e não tem como desligar: ele vem do servidor,
 * não de um parâmetro da URL. `pediuMine` é o botão "Meus cards" da tela, que
 * sobra apenas para o admin, a quem o filtro de fato muda alguma coisa.
 */
export function recorteDeDono(viewer: Viewer, pediuMine: boolean): string | undefined {
  if (!viewer.isAdmin) return viewer.id;
  return pediuMine ? viewer.id : undefined;
}
