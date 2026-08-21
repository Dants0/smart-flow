/**
 * Quebra o diff unificado por ARQUIVO.
 *
 * A tela de revisão precisa responder duas perguntas antes de qualquer outra:
 * **onde** muda e **o que** muda. Um `<pre>` com o diff inteiro responde as duas
 * mal — o dev rola procurando os `+++` pra descobrir quantos arquivos são.
 */
export interface DiffHunk {
  /** Cabeçalho `@@ -a,b +c,d @@`, com o contexto que vem depois dele. */
  header: string;
  /** Primeira linha do arquivo alterada, extraída do cabeçalho. */
  startLine: number | null;
  lines: string[];
}

export interface DiffFile {
  /** Caminho de destino, sem o prefixo `b/`. */
  path: string;
  added: number;
  removed: number;
  hunks: DiffHunk[];
  /** O diff só deste arquivo, pronto pra exibir. */
  raw: string;
}

function stripPrefix(path: string): string {
  return path.replace(/^[ab]\//, "").split("\t")[0].trim();
}

export function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let hunk: DiffHunk | null = null;

  for (const line of diff.split("\n")) {
    // "--- a/x" abre um arquivo novo; o caminho bom é o "+++ b/x" logo abaixo
    if (line.startsWith("--- ")) {
      current = { path: stripPrefix(line.slice(4)), added: 0, removed: 0, hunks: [], raw: "" };
      hunk = null;
      files.push(current);
      continue;
    }

    if (!current) continue;
    current.raw += (current.raw ? "\n" : "") + line;

    if (line.startsWith("+++ ")) {
      const target = stripPrefix(line.slice(4));
      // /dev/null = arquivo removido; aí o nome bom é o do "--- a/x"
      if (target && target !== "/dev/null") current.path = target;
      continue;
    }

    if (line.startsWith("@@")) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      hunk = { header: line, startLine: match ? Number(match[1]) : null, lines: [] };
      current.hunks.push(hunk);
      continue;
    }

    if (line.startsWith("+")) current.added++;
    else if (line.startsWith("-")) current.removed++;

    hunk?.lines.push(line);
  }

  // diff sem cabeçalho de arquivo (o modelo às vezes manda só os hunks):
  // devolve um "arquivo" sem nome em vez de perder o conteúdo
  if (files.length === 0 && diff.trim()) {
    return [
      {
        path: "",
        added: (diff.match(/^\+/gm) ?? []).length,
        removed: (diff.match(/^-/gm) ?? []).length,
        hunks: [],
        raw: diff,
      },
    ];
  }

  return files;
}

/** `ws_objects/mwsus/mwsus.pbl.src/w_lea_aih.srw` → `w_lea_aih.srw` */
export function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1) || path;
}

/** A pasta, pra mostrar em segundo plano sem estourar a largura. */
export function fileDir(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut > 0 ? path.slice(0, cut) : "";
}
