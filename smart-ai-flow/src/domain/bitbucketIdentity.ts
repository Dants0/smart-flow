/**
 * Qual identidade autentica o quê no Bitbucket.
 *
 * Desde que o API token da Atlassian substituiu a app password, o Basic Auth
 * pede metades diferentes conforme o destino:
 *
 *   git push       -> nome de usuário do Bitbucket
 *   API REST 2.0   -> e-mail da conta Atlassian
 *
 * Com app password o username servia pros dois, e por isso a plataforma tinha
 * um campo só. O sintoma da confusão é 401 em metade das operações: o push
 * sobe e o PR não abre, ou o contrário.
 */

/**
 * A metade do Basic Auth para as APIs. Cai pro username quando o e-mail não
 * foi preenchido — que é o comportamento antigo, e mantém funcionando quem
 * ainda usa app password.
 */
export function bitbucketApiIdentity(user: string, email: string | null | undefined): string {
  return email?.trim() || user;
}
