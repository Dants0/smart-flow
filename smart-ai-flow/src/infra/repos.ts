/**
 * Os dois repositórios que a esteira conhece.
 *
 * Antes existia um só (`SMART_DESKTOP_PATH`), o que deixava o card de SMART Web
 * sem código nenhum: aplicar diff, commitar e abrir PR eram operações
 * desktop-only. Cada sistema tem raiz, origin e conjunto de fontes próprios.
 */
export interface RepoConfig {
  id: string;
  label: string;
  /** Raiz do working copy dentro do container. Vazio = não configurado. */
  root: string;
  /** Onde os fontes vivem — só pra mensagem de ajuda e para o briefing. */
  sourceRoot: string;
  /**
   * Companheiro que precisa subir junto com o fonte. No smart_web cada `.sru`
   * tem um `.sru.prp` ao lado (9.619 deles versionados): commitar um sem o outro
   * deixa o objeto inconsistente no PR.
   */
  companionSuffix?: string;
}

const DESKTOP: RepoConfig = {
  id: 'smartdesktop',
  label: 'SMART Desktop',
  root: process.env.SMART_DESKTOP_PATH || '',
  sourceRoot: 'ws_objects/<lib>/<lib>.pbl.src/',
};

const WEB: RepoConfig = {
  id: 'smartweb',
  label: 'SMART Web',
  root: process.env.SMART_WEB_PATH || '',
  sourceRoot: 'fontespb11/<modulo>/',
  companionSuffix: '.prp',
};

export const REPOS: RepoConfig[] = [DESKTOP, WEB];

/**
 * Repositório do card. Cards antigos guardam o módulo direto ('atende',
 * 'mwsus', ...) e continuam apontando pro desktop, que é de onde vieram.
 */
export function repoForModule(module: string): RepoConfig {
  return module === 'smartweb' ? WEB : DESKTOP;
}

/**
 * Classificação de caminho, por repositório.
 *
 * `.pbl`, `.pbw` e `.pbd` são artefatos de build e **nunca** entram em commit —
 * no smart_desktop o próprio repositório reforça isso com Git LFS e um hook de
 * pre-commit. Fonte é qualquer `.sr?` (sra, srd, srf, srm, srq, srs, sru, srw):
 * a lista fechada de quatro extensões deixava de fora `.srf` (1.808 arquivos) e
 * `.srm`/`.srs`, que também são código versionado.
 */
export type PathKind = 'fonte' | 'proibido' | 'outro';

const FORBIDDEN = ['.pbl', '.pbw', '.pbd'];

export function classifyPathFor(repo: RepoConfig, relPath: string): PathKind {
  const lower = relPath.toLowerCase();
  // basename: `agenda50.pbl.src/x.sru` tem ".pbl" no caminho e É fonte válido
  const ext = lower.slice(lower.lastIndexOf('.'));

  if (FORBIDDEN.includes(ext)) return 'proibido';
  if (/^\.sr[a-z]$/.test(ext)) return 'fonte';
  // .sru.prp e afins: o companheiro herda a natureza do arquivo que acompanha
  if (repo.companionSuffix && lower.endsWith(repo.companionSuffix)) {
    const base = lower.slice(0, -repo.companionSuffix.length);
    return /\.sr[a-z]$/.test(base) ? 'fonte' : 'outro';
  }
  return 'outro';
}

/**
 * Acrescenta os companheiros que precisam subir junto. Sem isso o dev commitava
 * `uof_ativar_cpw.sru` e esquecia `uof_ativar_cpw.sru.prp` — erro silencioso,
 * porque nada quebra até alguém abrir o objeto.
 */
export function withCompanions(repo: RepoConfig, files: string[]): string[] {
  if (!repo.companionSuffix) return files;

  const out = new Set(files);
  for (const file of files) {
    if (/\.sr[a-z]$/i.test(file)) out.add(file + repo.companionSuffix);
  }
  return [...out];
}
