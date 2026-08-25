import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { classifyPathFor, repoForModule, withCompanions, type PathKind, type RepoConfig } from './repos';

const exec = promisify(execFile);

/**
 * Operações de git no working copy do repositório do card (SMART Desktop ou
 * SMART Web).
 *
 * Regras que o repositório do time impõe e que este módulo faz cumprir:
 *
 *  - **Só sobe fonte exportado** (`.sru`, `.sra`, `.srd`, `.srw`). `.pbl`,
 *    `.pbw` e `.pbd` são artefatos de build e ficam de fora sempre — o working
 *    copy vive com dezenas deles sujos por efeito de compilar.
 *  - **Stage seletivo**: só os arquivos que a correção alterou entram, nunca
 *    `git add -A`. Equivale ao "All None → marca só o que mudou" que o time faz
 *    na mão.
 *  - **Branch do chamado**: `bug/SMART-XXXXX`. A plataforma verifica e recusa;
 *    trocar de branch com árvore suja destruiria trabalho de quem está na máquina.
 */

export class GitError extends Error {}

/**
 * Tira usuário e senha de qualquer URL antes de a mensagem virar log, histórico
 * de card ou tela. O git repete a URL do remote em quase todo erro de push, e a
 * nossa carrega a app password.
 */
export function redactUrlCredentials(text: string): string {
  return text.replace(/(https?:\/\/)[^@\s/]+@/gi, '$1***@');
}

async function git(repo: RepoConfig, args: string[], timeoutMs = 60_000): Promise<string> {
  if (!repo.root) throw new GitError(`caminho do ${repo.label} não configurado`);
  try {
    const { stdout } = await exec('git', args, { cwd: repo.root, timeout: timeoutMs });
    return stdout.trim();
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const detail = (e.stderr || e.stdout || e.message || 'falha no git').trim();
    throw new GitError(redactUrlCredentials(detail));
  }
}

/** Branch esperada pro chamado, na convenção do time. */
export function branchForTicket(jiraKey: string): string {
  return `bug/${jiraKey}`;
}

export interface FileToCommit {
  path: string;
  kind: PathKind;
  /** Status do git: M, A, D, ?? ... */
  status: string;
  /** false = o dev precisa marcar na mão; a plataforma não seleciona sozinha. */
  autoSelect: boolean;
}

export interface VersioningPreview {
  currentBranch: string;
  expectedBranch: string;
  onExpectedBranch: boolean;
  remoteUrl: string;
  files: FileToCommit[];
  /** Arquivos sujos na árvore que NÃO são da correção — ficam de fora, só informam. */
  otherDirtyCount: number;
}

/**
 * Monta o retrato do que aconteceria num commit, sem executar nada.
 *
 * `appliedFiles` é a lista que o apply gravou no card — a fonte da verdade do
 * "o que essa correção mudou". Cruzamos com o `git status` porque um arquivo
 * pode ter sido revertido à mão depois, e aí não há o que commitar.
 */
export async function previewCommit(
  module: string,
  jiraKey: string,
  appliedFiles: string[],
): Promise<VersioningPreview> {
  const repo = repoForModule(module);
  const [currentBranch, remoteUrl, statusOut] = await Promise.all([
    git(repo, ['branch', '--show-current']),
    git(repo, ['remote', 'get-url', 'origin']).catch(() => ''),
    git(repo, ['status', '--porcelain']),
  ]);

  const dirty = new Map<string, string>();
  for (const line of statusOut.split('\n')) {
    if (!line.trim()) continue;
    // "XY caminho" — XY são dois caracteres de status
    dirty.set(line.slice(3).trim().replace(/^"|"$/g, ''), line.slice(0, 2).trim());
  }

  // O .prp do smart_web entra junto do .sru: commitar um sem o outro deixa o
  // objeto inconsistente no PR, e é erro silencioso.
  const candidates = withCompanions(repo, appliedFiles);
  const applied = new Set(candidates);
  const files: FileToCommit[] = candidates.map((path) => {
    const kind = classifyPathFor(repo, path);
    return {
      path,
      kind,
      status: dirty.get(path) ?? 'sem alteração',
      // Fonte alterado entra marcado; qualquer outra coisa exige o dev decidir.
      autoSelect: kind === 'fonte' && dirty.has(path),
    };
  });

  let otherDirtyCount = 0;
  for (const path of dirty.keys()) if (!applied.has(path)) otherDirtyCount++;

  return {
    currentBranch,
    expectedBranch: branchForTicket(jiraKey),
    onExpectedBranch: currentBranch === branchForTicket(jiraKey),
    remoteUrl: redactUrlCredentials(remoteUrl),
    files,
    otherDirtyCount,
  };
}

export interface CommitInput {
  /** Módulo do card — decide em qual repositório o commit acontece. */
  module: string;
  jiraKey: string;
  /** Exatamente o que o dev confirmou na tela. */
  files: string[];
  message: string;
  authorName: string;
  authorEmail: string;
}

/** Mensagem no padrão do time. */
export function commitMessage(jiraKey: string, summary?: string): string {
  const base = `:bug:fix ${jiraKey}`;
  const extra = summary?.trim().replace(/\s+/g, ' ').slice(0, 100);
  return extra ? `${base} ${extra}` : base;
}

/**
 * Commita os arquivos escolhidos. Recusa qualquer artefato de build mesmo que
 * venha marcado na requisição: a regra não depende da UI ter filtrado direito.
 */
export async function commitFiles(input: CommitInput): Promise<{ hash: string }> {
  if (input.files.length === 0) throw new GitError('nenhum arquivo selecionado pro commit');

  const repo = repoForModule(input.module);
  const forbidden = input.files.filter((f) => classifyPathFor(repo, f) === 'proibido');
  if (forbidden.length > 0) {
    throw new GitError(
      `artefato de build não entra em commit: ${forbidden.join(', ')} — nada foi commitado`,
    );
  }

  const branch = await git(repo, ['branch', '--show-current']);
  if (branch !== branchForTicket(input.jiraKey)) {
    throw new GitError(
      `o working copy está em "${branch}", e não em "${branchForTicket(input.jiraKey)}" — ` +
        'troque de branch você mesmo antes de commitar (a plataforma não troca: a árvore tem alterações suas).',
    );
  }

  // -- pathspec: nome de arquivo do PB tem espaço e acento à vontade
  await git(repo, ['add', '--', ...input.files]);
  await git(repo, [
    '-c',
    `user.name=${input.authorName}`,
    '-c',
    `user.email=${input.authorEmail}`,
    'commit',
    '-m',
    input.message,
    '--only',
    '--',
    ...input.files,
  ]);

  return { hash: await git(repo, ['rev-parse', 'HEAD']) };
}

/**
 * Empurra a branch pro origin usando a credencial do dev.
 *
 * A URL com credencial é montada aqui e nunca gravada no `.git/config` — assim
 * a app password não fica no working copy de ninguém. Erros passam por
 * `redactUrlCredentials` antes de sair deste módulo.
 */
export async function pushBranch(
  module: string,
  branch: string,
  // `user` (username do Bitbucket), não `email`: a Atlassian pede o username
  // nos comandos Git e o e-mail nas APIs. Ver authHeader em bitbucket.ts.
  creds: { user: string; appPassword: string },
): Promise<void> {
  const repo = repoForModule(module);
  const remote = await git(repo, ['remote', 'get-url', 'origin']);
  const authed = remote.replace(
    /^https:\/\/(?:[^@/]+@)?/i,
    `https://${encodeURIComponent(creds.user)}:${encodeURIComponent(creds.appPassword)}@`,
  );
  if (!authed.startsWith('https://')) {
    throw new GitError('só sei autenticar push em remote HTTPS (o origin parece ser SSH)');
  }

  await git(repo, ['push', authed, `HEAD:refs/heads/${branch}`], 180_000);
}

/** `workspace/repo` a partir da URL do origin — o que a API do Bitbucket pede. */
export function parseBitbucketRepo(remoteUrl: string): { workspace: string; repo: string } | null {
  const match = remoteUrl.match(/bitbucket\.org[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!match) return null;
  return { workspace: match[1], repo: match[2] };
}

export async function remoteUrl(module: string): Promise<string> {
  return git(repoForModule(module), ['remote', 'get-url', 'origin']);
}

/** Branch em que o working copy está agora — alimenta o monitor. */
export async function currentBranch(repo: RepoConfig): Promise<string> {
  return git(repo, ['branch', '--show-current']);
}
