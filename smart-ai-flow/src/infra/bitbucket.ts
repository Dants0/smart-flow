/**
 * Abertura de pull request no Bitbucket Cloud (API 2.0).
 *
 * Autentica com **App Password do próprio dev** — o PR precisa aparecer como
 * dele, não de um robô da plataforma. A credencial é a mesma usada no push.
 */
export interface BitbucketCredentials {
  user: string;
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

function authHeader(creds: BitbucketCredentials): string {
  return 'Basic ' + Buffer.from(`${creds.user}:${creds.appPassword}`).toString('base64');
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
      'o Bitbucket recusou sua credencial (verifique usuário e app password em Configurações > Minha conta, e se a app password tem permissão de Pull requests: write)',
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

  if (resp.status === 401) {
    return { fullName, ok: false, detail: 'usuário ou app password inválidos' };
  }
  if (resp.status === 403) {
    return { fullName, ok: false, detail: 'sem permissão para este repositório' };
  }
  if (resp.status === 404) {
    return { fullName, ok: false, detail: 'repositório não encontrado para esta credencial' };
  }
  if (!resp.ok) return { fullName, ok: false, detail: `HTTP ${resp.status}` };

  return { fullName, ok: true, detail: `acesso confirmado a ${fullName}` };
}
