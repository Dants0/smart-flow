import { execFile } from 'node:child_process';
import { copyFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Escrita no working copy do SMART Desktop.
 *
 * Isto inverte a decisão original do projeto ("a IA propõe, o dev aplica, o
 * backend é só-leitura"). A inversão é deliberada e pedida, mas as garantias
 * que sobraram no lugar são o que torna aceitável mexer no código de alguém:
 *
 *  - só roda por ação explícita do dev em REVISAO, nunca dentro do pipeline;
 *  - `--dry-run` antes de tocar em qualquer arquivo: diff que não aplica limpo
 *    não aplica nada pela metade;
 *  - backup de cada arquivo alterado, com reversão de um clique;
 *  - **nada de controle de versão**: o backend não commita, não cria branch e
 *    não reverte nada no repositório. O `diff`/`checkout` do VCS do dev continua
 *    sendo a rede de proteção final, e continua funcionando porque a mudança
 *    aparece lá como alteração local dele.
 */

/** Raiz do working copy. No compose vem montada em /smart_desktop. */
const WORKSPACE_ROOT = process.env.SMART_DESKTOP_PATH || '';

/** Onde ficam as cópias de segurança. Volume próprio: não suja o working copy. */
const BACKUP_ROOT = process.env.WORKSPACE_BACKUP_DIR || '/app/.backups';

export interface ApplyResult {
  files: string[];
  backupDir: string;
  /** Nível de -p que o patch aceitou — útil no histórico quando algo sai torto. */
  strip: number;
}

export class WorkspaceError extends Error {}

/** Working copy configurado e alcançável? Alimenta o monitor e as rotas. */
export async function checkWorkspace(): Promise<{ ok: boolean; detail: string }> {
  if (!WORKSPACE_ROOT) {
    return { ok: false, detail: 'SMART_DESKTOP_PATH não configurado — aplicar diff indisponível' };
  }
  try {
    const info = await stat(WORKSPACE_ROOT);
    if (!info.isDirectory()) return { ok: false, detail: `${WORKSPACE_ROOT} não é diretório` };
  } catch {
    return { ok: false, detail: `${WORKSPACE_ROOT} não encontrado no container` };
  }

  // Montagem :ro só falha na hora de escrever — melhor descobrir aqui do que
  // no meio de um apply, com metade dos arquivos já copiados pro backup.
  const probe = join(WORKSPACE_ROOT, `.smart-ai-flow-write-probe-${process.pid}`);
  try {
    await writeFile(probe, '');
    await rm(probe, { force: true });
  } catch {
    return { ok: false, detail: 'montado somente-leitura — aplicar diff indisponível' };
  }

  return { ok: true, detail: `${WORKSPACE_ROOT} gravável` };
}

/**
 * Arquivos que o diff pretende tocar, pelas linhas `+++`. Serve pra duas
 * coisas: saber o que copiar pro backup e barrar caminho que escapa da raiz.
 */
export function parseDiffTargets(diff: string, strip: number): string[] {
  const targets: string[] = [];

  for (const line of diff.split('\n')) {
    if (!line.startsWith('+++ ')) continue;

    // "+++ b/ws_objects/x.srw\t2026-08-20" -> "b/ws_objects/x.srw"
    const raw = line.slice(4).split('\t')[0].trim();
    if (!raw || raw === '/dev/null') continue;

    const stripped = raw.split('/').slice(strip).join('/');
    if (stripped) targets.push(stripped);
  }

  return [...new Set(targets)];
}

/**
 * Regra de ouro do repositório do SMART Desktop, que vale pra qualquer operação
 * de escrita ou commit:
 *
 *  - `.pbl`, `.pbw`, `.pbd` são artefatos de build do PowerBuilder. **Nunca**
 *    entram num commit — e a plataforma nem escreve neles. O working copy do dev
 *    vive com dezenas deles modificados como efeito de compilar localmente;
 *    tocar num é mandar binário de outra pessoa junto da correção.
 *  - `.sru`, `.sra`, `.srd`, `.srw` são os fontes exportados: são estes que
 *    versionam, e os únicos que sobem.
 *
 * Qualquer outra extensão é território de dúvida (`.pbr`, por exemplo, aparece
 * em commits reais): não bloqueia a escrita, mas fica marcada como `outro` pra
 * quem for montar o commit decidir explicitamente.
 */
const FORBIDDEN_EXTENSIONS = ['.pbl', '.pbw', '.pbd'];
const SOURCE_EXTENSIONS = ['.sru', '.sra', '.srd', '.srw'];

export type PathKind = 'fonte' | 'proibido' | 'outro';

export function classifyPath(relPath: string): PathKind {
  const lower = relPath.toLowerCase();
  // basename: `agenda50.pbl.src/x.sru` tem ".pbl" no caminho e É fonte válido
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (FORBIDDEN_EXTENSIONS.includes(ext)) return 'proibido';
  if (SOURCE_EXTENSIONS.includes(ext)) return 'fonte';
  return 'outro';
}

/**
 * Recusa caminho que sai da raiz. O diff é texto gerado por um LLM a partir de
 * um chamado colado por um humano: `../../etc/passwd` ou `/etc/hosts` não é
 * cenário teórico, é o mínimo a checar antes de deixar `patch` escrever.
 */
export function resolveInside(root: string, relPath: string): string | null {
  if (isAbsolute(relPath)) return null;

  const full = resolve(root, normalize(relPath));
  const rel = relative(resolve(root), full);
  if (rel === '' || rel.startsWith('..') || rel.split(sep).includes('..')) return null;
  return full;
}

function assertInsideWorkspace(relPath: string): string {
  const full = resolveInside(WORKSPACE_ROOT, relPath);
  if (!full) throw new WorkspaceError(`caminho fora do working copy: ${relPath}`);
  return full;
}

/** `patch --dry-run` no nível dado. Devolve o erro em vez de lançar. */
async function dryRun(diffFile: string, strip: number): Promise<string | null> {
  try {
    await run('patch', ['-p', String(strip), '--dry-run', '--forward', '-i', diffFile], {
      cwd: WORKSPACE_ROOT,
      timeout: 30_000,
    });
    return null;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return (e.stdout || '') + (e.stderr || '') || e.message || 'falha desconhecida';
  }
}

/**
 * Aplica o diff da proposta no working copy.
 *
 * O nível de `-p` não é fixo porque o diff vem do LLM: às vezes com prefixo
 * `a/`+`b/` (git style, -p1), às vezes com o caminho já relativo à raiz (-p0).
 * Descobrir por dry-run é mais confiável do que exigir um formato do modelo.
 */
export async function applyDiff(cardId: string, diff: string): Promise<ApplyResult> {
  const health = await checkWorkspace();
  if (!health.ok) throw new WorkspaceError(health.detail);
  if (!diff.trim()) throw new WorkspaceError('a proposta não tem diff pra aplicar');

  const diffFile = join(tmpdir(), `smart-ai-flow-${cardId}-${Date.now()}.diff`);
  // patch é exigente com a última linha: sem \n final ele reclama de "unexpected end of file"
  await writeFile(diffFile, diff.endsWith('\n') ? diff : `${diff}\n`, 'utf8');

  try {
    let strip = -1;
    let lastError = '';
    for (const candidate of [1, 0, 2]) {
      const error = await dryRun(diffFile, candidate);
      if (error === null) {
        strip = candidate;
        break;
      }
      if (!lastError) lastError = error;
    }

    if (strip < 0) {
      throw new WorkspaceError(
        `o diff não aplica limpo no working copy — nada foi alterado.\n${lastError.trim()}`,
      );
    }

    const targets = parseDiffTargets(diff, strip);
    if (targets.length === 0) throw new WorkspaceError('não consegui identificar os arquivos do diff');

    // Binário de build nunca é tocado — nem aqui, nem no commit. Recusa antes de
    // copiar backup: o dry-run do patch passaria feliz por cima de um .pbl.
    const forbidden = targets.filter((t) => classifyPath(t) === 'proibido');
    if (forbidden.length > 0) {
      throw new WorkspaceError(
        `o diff mexe em artefato de build, que não pode ser alterado: ${forbidden.join(', ')}. ` +
          'Só fontes exportados (.sru, .sra, .srd, .srw) podem ser modificados — nada foi alterado.',
      );
    }

    const backupDir = join(BACKUP_ROOT, cardId, String(Date.now()));
    for (const rel of targets) {
      const full = assertInsideWorkspace(rel);
      const dest = join(backupDir, rel);
      await mkdir(dirname(dest), { recursive: true });
      try {
        await copyFile(full, dest);
      } catch {
        // arquivo novo criado pelo diff: não há o que preservar, e o revert
        // apaga em vez de restaurar (ver revertDiff)
      }
    }

    try {
      await run('patch', ['-p', String(strip), '--forward', '-i', diffFile], {
        cwd: WORKSPACE_ROOT,
        timeout: 60_000,
      });
    } catch (err) {
      // dry-run passou e o real falhou: estado imprevisível, desfaz pelo backup
      await restoreFromBackup(backupDir, targets);
      const e = err as { stdout?: string; stderr?: string };
      throw new WorkspaceError(
        `falha ao aplicar o diff — arquivos restaurados do backup.\n${(e.stdout || '') + (e.stderr || '')}`,
      );
    }

    return { files: targets, backupDir, strip };
  } finally {
    await rm(diffFile, { force: true });
  }
}

/** Desfaz um apply: devolve cada arquivo ao conteúdo salvo no backup. */
export async function revertDiff(backupDir: string, files: string[]): Promise<void> {
  const health = await checkWorkspace();
  if (!health.ok) throw new WorkspaceError(health.detail);

  try {
    await stat(backupDir);
  } catch {
    throw new WorkspaceError(
      'backup não encontrado — desfaça pelo controle de versão do seu working copy',
    );
  }

  await restoreFromBackup(backupDir, files);
}

async function restoreFromBackup(backupDir: string, files: string[]): Promise<void> {
  for (const rel of files) {
    const full = assertInsideWorkspace(rel);
    const backup = join(backupDir, rel);
    try {
      await stat(backup);
    } catch {
      // sem backup = o arquivo não existia antes do apply; desfazer é apagar
      await rm(full, { force: true });
      continue;
    }
    await mkdir(dirname(full), { recursive: true });
    await copyFile(backup, full);
  }
}
