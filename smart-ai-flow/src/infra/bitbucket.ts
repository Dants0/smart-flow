/**
 * Abertura de pull request no Bitbucket Cloud (API 2.0).
 *
 * Autentica com a **credencial do próprio dev** (API token da Atlassian ou app
 * password antiga) — o PR precisa aparecer como dele, não de um robô da
 * plataforma. O segredo é o mesmo usado no push, mas a IDENTIDADE não: aqui vai
 * o e-mail da conta Atlassian, no push vai o nome de usuário do Bitbucket.
 */
export interface BitbucketCredentials {
  /** Nome de usuário do Bitbucket — usado no git push, NÃO aqui. */
  user: string;
  /** E-mail da conta Atlassian — é o que a API REST 2.0 aceita no Basic Auth. */
  email: string;
  appPassword: string;
}

export interface CreatePullRequestInput {
  workspace: string;
  repo: string;
  title: string;
  description: string;
  sourceBranch: string;
  destinationBranch: string;
}

export interface PullRequest {
  id: number;
  url: string;
}

export class BitbucketError extends Error {}

/**
 * `email`, não `user`. A documentação da Atlassian é explícita: API token +
 * e-mail para as APIs do Bitbucket, API token + nome de usuário para os
 * comandos Git. Usar o username aqui devolve 401 com token novo — e devolvia
 * 200 na época da app password, que é por que isso passou despercebido.
 */
export function authHeader(creds: BitbucketCredentials): string {
  return 'Basic ' + Buffer.from(`${creds.email}:${creds.appPassword}`).toString('base64');
}

export async function createPullRequest(
  input: CreatePullRequestInput,
  creds: BitbucketCredentials,
): Promise<PullRequest> {
  const url = `https://api.bitbucket.org/2.0/repositories/${input.workspace}/${input.repo}/pullrequests`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: authHeader(creds), 'content-type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      description: input.description,
      source: { branch: { name: input.sourceBranch } },
      destination: { branch: { name: input.destinationBranch } },
      // Quem apaga a branch é o fluxo do time no merge, não a plataforma.
      close_source_branch: false,
    }),
  });

  if (resp.status === 401 || resp.status === 403) {
    throw new BitbucketError(
      'o Bitbucket recusou sua credencial ao abrir o PR. Em Configurações > Minha conta, ' +
        'confira o "E-mail da conta Atlassian" (é ele que autentica a API — o usuário do ' +
        'Bitbucket vale só pro push) e se o token tem o escopo write:pullrequest:bitbucket',
    );
  }

  const body = (await resp.json().catch(() => ({}))) as {
    id?: number;
    links?: { html?: { href?: string } };
    error?: { message?: string };
  };

  if (!resp.ok) {
    // Duplicado é o caso comum e merece mensagem própria: já existe PR da branch.
    throw new BitbucketError(
      body.error?.message ?? `Bitbucket respondeu ${resp.status} ao abrir o pull request`,
    );
  }

  const href = body.links?.html?.href;
  if (!body.id || !href) throw new BitbucketError('Bitbucket aceitou o PR mas não devolveu o link');

  return { id: body.id, url: href };
}

/** PR já aberto para esta branch — evita duplicar quando o dev clica duas vezes. */
export async function findOpenPullRequest(
  workspace: string,
  repo: string,
  sourceBranch: string,
  creds: BitbucketCredentials,
): Promise<PullRequest | null> {
  const query = encodeURIComponent(`state="OPEN" AND source.branch.name="${sourceBranch}"`);
  const url = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pullrequests?q=${query}`;

  const resp = await fetch(url, { headers: { Authorization: authHeader(creds) } });
  if (!resp.ok) return null;

  const body = (await resp.json().catch(() => ({}))) as {
    values?: { id?: number; links?: { html?: { href?: string } } }[];
  };
  const first = body.values?.[0];
  if (!first?.id || !first.links?.html?.href) return null;
  return { id: first.id, url: first.links.html.href };
}

export interface RepositoryAccess {
  fullName: string;
  /** true = a credencial enxerga o repositório (leitura garantida). */
  ok: boolean;
  detail: string;
}

/**
 * Confere se a credencial do dev alcança o repositório. Usado no "testar
 * conexão" e no Monitor de Recursos — a alternativa é o dev descobrir que a app
 * password está errada só na hora de abrir o PR, com o commit já feito.
 */
export async function checkRepositoryAccess(
  workspace: string,
  repo: string,
  creds: BitbucketCredentials,
): Promise<RepositoryAccess> {
  const url = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}`;
  const fullName = `${workspace}/${repo}`;

  let resp: Response;
  try {
    resp = await fetch(url, { headers: { Authorization: authHeader(creds) } });
  } catch (err) {
    return { fullName, ok: false, detail: err instanceof Error ? err.message : 'sem resposta' };
  }

  // As três mensagens apontam pro campo errado certo: com API token o 401 é
  // quase sempre e-mail no lugar do username (ou vice-versa), e o Bitbucket
  // responde 404 — não 403 — quando falta escopo, pra não revelar o repositório.
  if (resp.status === 401) {
    return {
      fullName,
      ok: false,
      detail:
        'credencial recusada — se você usa API token, o campo "E-mail da conta Atlassian" ' +
        'precisa ser o e-mail (o usuário do Bitbucket vale só pro push)',
    };
  }
  if (resp.status === 403) {
    return { fullName, ok: false, detail: 'sem permissão para este repositório' };
  }
  if (resp.status === 404) {
    return {
      fullName,
      ok: false,
      detail:
        'repositório não encontrado para esta credencial — confira os escopos do token ' +
        '(read/write de repository e pull request)',
    };
  }
  if (!resp.ok) return { fullName, ok: false, detail: `HTTP ${resp.status}` };

  return { fullName, ok: true, detail: `acesso confirmado a ${fullName}` };
}
