/**
 * Login pela conta do Jira — regras puras, sem rede nem banco.
 *
 * Desde 2026-09-16 não existe mais "criar conta na plataforma": quem autentica
 * no Jira da Pixeon existe aqui. O usuário local passa a ser só o lugar onde
 * moram preferências, cards e credenciais do Bitbucket daquela pessoa.
 */

/** Conta local já existente que casou com o que foi digitado no login. */
export interface LoginCandidate {
  jiraUser: string | null;
}

/**
 * Por onde autenticar.
 *
 * - `jira`: conta vinculada ao Jira (ou nenhuma conta ainda). A senha local
 *   dessas contas NÃO vale mais — senão a tela pública de "esqueci minha
 *   senha", que troca a senha de qualquer um, continuaria sendo porta de
 *   entrada para a conta de quem já usa o Jira.
 * - `local-depois-jira`: conta antiga, criada antes do login pelo Jira e nunca
 *   vinculada (ex.: o admin do bootstrap). Confere a senha local primeiro, SEM
 *   gastar uma tentativa no Jira — cada senha errada lá aproxima o CAPTCHA.
 */
export type LoginRoute = 'jira' | 'local-depois-jira';

export function loginRoute(candidate: LoginCandidate | null): LoginRoute {
  return candidate && !candidate.jiraUser ? 'local-depois-jira' : 'jira';
}

/**
 * Qual usuário mandar ao Jira. A conta já vinculada manda o `jiraUser`
 * gravado: o dev pode digitar o nome de usuário da plataforma, que nas contas
 * antigas nem sempre é igual ao do Jira.
 */
export function jiraUsernameFor(candidate: LoginCandidate | null, typed: string): string {
  return candidate?.jiraUser?.trim() || typed.trim();
}

export type JiraLoginFailure = 'CAPTCHA' | 'UNAUTHORIZED' | 'UNAVAILABLE';

/**
 * Traduz a resposta do `/myself`. CAPTCHA vem pelo header e pode chegar até com
 * 200 (mesma regra de `classifyDenial`); qualquer coisa que não seja 200 nem
 * negação é o Jira fora do ar ou a URL base errada — não "senha errada", que
 * mandaria o dev redigitar e queimar tentativa à toa.
 */
export function classifyJiraLogin(
  status: number,
  deniedReasonHeader: string | null,
): JiraLoginFailure | null {
  if (deniedReasonHeader?.toUpperCase().includes('CAPTCHA')) return 'CAPTCHA';
  if (status === 401 || status === 403) return 'UNAUTHORIZED';
  if (status !== 200) return 'UNAVAILABLE';
  return null;
}

/**
 * Nome de usuário local de quem entra pela primeira vez: o `name` canônico do
 * Jira, em minúsculas (o Jira Server aceita login sem diferenciar caixa, e o
 * `username` local é único com caixa — sem normalizar, "Guilherme.Dantas" e
 * "guilherme.dantas" virariam duas contas).
 */
export function localUsernameFromJira(jiraName: string): string {
  return jiraName.trim().toLowerCase();
}
