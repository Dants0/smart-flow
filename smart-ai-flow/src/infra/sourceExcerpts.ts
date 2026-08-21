import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { repoForModule } from './repos';
import { resolveObjectPaths } from './objectIndex';

const exec = promisify(execFile);

/**
 * Lê o CÓDIGO REAL dos objetos que a análise apontou.
 *
 * Motivo, de dois casos concretos:
 *
 *  1. No SMART-50927 a análise concluiu certo ("preciso inspecionar o evento
 *     `avancar` destas janelas") e a esteira parou, porque o RAG não tinha
 *     trazido o código — enquanto o repositório estava montado no backend.
 *  2. A primeira versão disto trouxe **só os forward prototypes**: em fonte
 *     PowerBuilder o topo do arquivo tem um bloco de assinaturas, e um
 *     `git grep -C25` de cima pra baixo enche o orçamento com ele antes de
 *     chegar no corpo da função (em `u_dw_pac.sru`, assinatura na linha 83,
 *     corpo na 1903). O modelo recebeu assinatura e, com razão, recusou propor.
 *
 * Por isso a extração aqui é dirigida: pula o bloco de prototypes, prioriza
 * DEFINIÇÕES com corpo e recorta pra frente — corpo de função corre pra baixo.
 */
export interface SourceExcerpt {
  path: string;
  /** Trecho com número de linha. */
  content: string;
}

export interface SourceMaterial {
  excerpts: SourceExcerpt[];
  /** Objetos que a análise citou e o repositório não conhece. */
  notFound: string[];
}

const MAX_CHARS_PER_FILE = 24000;
const MAX_TOTAL_CHARS = 72000;
const MAX_FILES = 6;
/** Teto de segurança: bloco maior que isso é cortado, mas COM AVISO. */
const MAX_BLOCK_LINES = 400;
/** Linhas em volta de uma ocorrência que não é definição (ex: chamada). */
const CALL_CONTEXT = 12;

/**
 * Identificadores no estilo PowerBuilder dentro do texto: `uof_testar_status`,
 * `i_bAvancar`, `w_lea_aih`, `dw_pac01tab`. São eles que dizem QUAL trecho do
 * arquivo interessa.
 */
export function extractIdentifiers(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\b[a-z]{1,4}_[a-z0-9_]{2,}\b/gi)) {
    found.add(match[0]);
  }
  for (const word of ['avancar', 'avançar', 'clicked', 'itemchanged', 'rowfocuschanged']) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) found.add(word);
  }
  return [...found].slice(0, 12);
}

/**
 * Faixas de `forward prototypes` … `end prototypes`. Tudo ali dentro é
 * assinatura sem corpo: casa com a busca e não serve pra escrever diff.
 */
export function prototypeRanges(lines: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  let start = -1;

  lines.forEach((line, i) => {
    const trimmed = line.trim().toLowerCase();
    if (trimmed === 'forward prototypes') start = i;
    else if (trimmed === 'end prototypes' && start >= 0) {
      ranges.push([start, i]);
      start = -1;
    }
  });

  return ranges;
}

/**
 * Fim real do bloco que começa em `start`.
 *
 * No fonte exportado do PowerBuilder todo bloco fecha com `end event`,
 * `end function`, `end subroutine` ou `end type`. Cortar numa janela fixa de
 * linhas — como esta função fazia antes — entregava evento pela metade: o
 * `avancar` de w_sismama_citopatologico vai da linha 189 à 341, e o modelo
 * recebia até a 279, justamente sem o trecho onde a lógica mora. Ele percebeu e
 * avisou; pior seria não perceber.
 */
export function blockEnd(lines: string[], start: number): { end: number; truncated: boolean } {
  const limit = Math.min(start + MAX_BLOCK_LINES, lines.length - 1);

  for (let i = start + 1; i <= limit; i++) {
    if (/^\s*end\s+(event|function|subroutine|type|prototypes)\b/i.test(lines[i])) {
      return { end: i, truncated: false };
    }
  }

  // não fechou dentro do teto: corta, mas quem lê precisa saber que cortou
  return { end: limit, truncated: limit < lines.length - 1 };
}

/**
 * A linha inicia uma definição com corpo?
 *
 * No fonte exportado o corpo vem logo após o `;` da assinatura:
 *   `public function boolean uof_testar_status (long p_npacreg);STRING sStatus`
 *   `event avancar;call super::avancar;LONG nPacReg`
 * A assinatura sem `;` (linha 83 do u_dw_pac) é forward prototype.
 */
export function isDefinitionStart(line: string, term: string): boolean {
  const lower = line.toLowerCase();
  const t = term.toLowerCase();
  if (!lower.includes(t)) return false;

  if (/^\s*event\s/.test(lower) && lower.includes(';')) return true;
  if (/(function|subroutine)\s/.test(lower) && lower.includes(';')) return true;
  return false;
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];

  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 3) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Recorta os trechos que interessam de um arquivo, com definições primeiro.
 * Exportada pra ter teste: é a regra que decidiu errado da primeira vez.
 */
export function selectExcerpt(content: string, terms: string[]): string {
  const lines = content.split('\n');
  const skip = prototypeRanges(lines);
  const inPrototypes = (i: number) => skip.some(([a, b]) => i >= a && i <= b);

  const definitions: [number, number][] = [];
  const calls: [number, number][] = [];
  const cut = new Set<number>(); // início de bloco que não coube inteiro

  lines.forEach((line, i) => {
    if (inPrototypes(i)) return;
    for (const term of terms) {
      if (!line.toLowerCase().includes(term.toLowerCase())) continue;

      if (isDefinitionStart(line, term)) {
        // bloco inteiro, até o `end event`/`end function` — nada de meia função
        const { end, truncated } = blockEnd(lines, i);
        definitions.push([i, end]);
        if (truncated) cut.add(i);
      } else {
        calls.push([Math.max(0, i - CALL_CONTEXT), Math.min(i + CALL_CONTEXT, lines.length - 1)]);
      }
      break;
    }
  });

  /*
   * Definição primeiro — e isso é ORÇAMENTO, não só ordem de exibição.
   *
   * Misturar tudo e ordenar por linha fazia as dezenas de ocorrências de uma
   * flag no topo do arquivo consumirem o teto antes de chegar no corpo da
   * função (em u_dw_pac.sru, `uof_testar_status` está na linha 1903 e o evento
   * `avancar` na 2666 — os dois ficavam de fora). Definições agora enchem o
   * orçamento primeiro; chamadas entram com o que sobrar.
   */
  const definitionRanges = mergeRanges(definitions);
  const callRanges = mergeRanges(calls).filter(
    // chamada que já está dentro de uma definição escolhida não repete
    ([start, end]) => !definitionRanges.some(([a, b]) => start >= a && end <= b),
  );
  const chosen = [...definitionRanges, ...callRanges];

  if (chosen.length === 0) {
    // nada casou: o cabeçalho ainda diz o que o objeto é e de quem herda
    return lines
      .slice(0, 60)
      .map((l, i) => `${i + 1}: ${l}`)
      .join('\n')
      .slice(0, MAX_CHARS_PER_FILE);
  }

  const parts: string[] = [];
  let total = 0;
  let ignorados = 0;

  for (const [start, end] of chosen) {
    const block = lines
      .slice(start, end + 1)
      .map((l, i) => `${start + i + 1}: ${l}`)
      .join('\n');

    // teto por arquivo é respeitado bloco a bloco, não estourado pelo último
    if (total + block.length > MAX_CHARS_PER_FILE) {
      ignorados++;
      continue;
    }

    // Aviso explícito de corte: o modelo precisa saber que está raciocinando
    // sobre um trecho incompleto, em vez de supor que viu o bloco todo.
    parts.push(cut.has(start) ? `${block}\n[CORTADO: o bloco continua além da linha ${end + 1}]` : block);
    total += block.length;
  }

  if (ignorados > 0) {
    parts.push(`[${ignorados} trecho(s) relevante(s) não couberam no orçamento deste arquivo]`);
  }

  return parts.join('\n...\n');
}

/**
 * Nomes que aparecem NO CÓDIGO já lido e que valem como próxima busca: eventos
 * sobrescritos, funções chamadas e flags de instância.
 *
 * É o que faz a busca crescer sozinha. O chamado do SMART-50927 escrevia
 * "avança" (não `avancar`) e nunca mencionava `uof_testar_status` — sem colher
 * termos do próprio código, a plataforma abria o ancestral e não sabia o que
 * procurar dentro dele, caindo no cabeçalho do arquivo.
 */
export function harvestTerms(code: string): string[] {
  const found = new Set<string>();

  // "event avancar;call super::avancar;" e "call super::avancar"
  for (const m of code.matchAll(/\b(?:event|super::)\s*([a-z_][\w]*)/gi)) found.add(m[1]);
  // "This.uof_testar_status (0)" — função de instância chamada
  for (const m of code.matchAll(/\b(?:this|parent)\.([a-z_][\w]*)\s*\(/gi)) found.add(m[1]);
  // "uof_algo (" e "f_algo (" soltos
  for (const m of code.matchAll(/\b((?:uof|of|f|wf|gnv)_[a-z0-9_]+)\s*\(/gi)) found.add(m[1]);
  // flags de instância: i_bAvancar, i_sStatus
  for (const m of code.matchAll(/\b(i_[a-z][\w]*)\b/gi)) found.add(m[1]);

  return [...found].filter((t) => t.length >= 4).slice(0, 15);
}

/**
 * Ancestrais declarados no fonte: o tipo de cada controle e o da própria janela.
 *
 * `type dw_pac01tab from u_dw_pac within w_sismama_citopatologico` é a linha que
 * liga a tela ao user object onde a lógica realmente mora. Sem seguir isso, a
 * análise só enxerga a janela — e no SMART-50927 a validação de óbito estava no
 * ancestral `u_dw_pac`, não na tela. Buscar a mensagem no índice também não
 * resolvia: o texto literal existe copiado em `agenda50`, que não é o caminho
 * que dispara nessas telas.
 */
export function declaredAncestors(content: string): string[] {
  const found = new Set<string>();

  // "type <controle> from <ancestral> within <pai>" e "global type <x> from <y>"
  for (const match of content.matchAll(/^\s*(?:global\s+)?type\s+\w+\s+from\s+([a-z_][\w]*)/gim)) {
    const ancestor = match[1].toLowerCase();
    // tipos nativos do PowerBuilder não são objeto do repositório
    if (/^(window|datawindow|userobject|menu|structure|application|commandbutton|statictext|singlelineedit|tab|datastore|nonvisualobject)$/.test(ancestor)) {
      continue;
    }
    found.add(match[1]);
  }

  return [...found].slice(0, 6);
}

/**
 * Junta o material que o proposer precisa pra escrever um diff que aplica.
 * Sem `excerpts`, não há o que propor — e é melhor dizer isso do que produzir
 * um diff contra arquivo que ninguém leu.
 */
export async function gatherSourceMaterial(
  module: string,
  objectNames: string[],
  contextText: string,
): Promise<SourceMaterial> {
  const repo = repoForModule(module);
  if (!repo.root) return { excerpts: [], notFound: objectNames };

  // termos crescem conforme a leitura: começam no chamado/análise e ganham o
  // que o próprio código revela (eventos, funções chamadas, flags)
  const terms = extractIdentifiers(contextText);

  /*
   * O texto do chamado e o print costumam entregar o objeto de graça: o título
   * da janela aparece na barra do screenshot, e o suporte cola o nome da tela na
   * descrição. Por isso os identificadores do contexto também são tentados como
   * nome de objeto — assim o arquivo certo é aberto mesmo quando a análise
   * esqueceu de listá-lo em affectedObjects.
   *
   * A ordem importa: o que a análise apontou vem primeiro e ganha o orçamento
   * de arquivos; o que veio do texto é complemento.
   */
  const candidates = [...new Set([...objectNames, ...terms])];
  const resolved = await resolveObjectPaths(module, candidates);

  // Só o que a análise NOMEOU conta como "não encontrado" — palpite tirado do
  // texto do chamado não vira acusação de objeto inexistente.
  const notFound = objectNames.filter((name) => !resolved.has(name));
  const excerpts: SourceExcerpt[] = [];
  let total = 0;

  const ancestors = new Set<string>();

  async function read(path: string): Promise<string | null> {
    try {
      const { stdout } = await exec('git', ['show', `HEAD:${path}`], {
        cwd: repo.root,
        maxBuffer: 16 * 1024 * 1024,
        timeout: 30_000,
      });
      return stdout;
    } catch {
      return null;
    }
  }

  function add(path: string, content: string): void {
    let excerpt = selectExcerpt(content, terms);

    /*
     * Segunda leitura do MESMO arquivo com os termos que ele próprio revelou:
     * o `event avancar` do ancestral chama `This.uof_testar_status(0)`, e é essa
     * segunda passada que traz o corpo da função onde a lógica mora.
     */
    const novos = harvestTerms(excerpt).filter(
      (t) => !terms.some((existente) => existente.toLowerCase() === t.toLowerCase()),
    );
    if (novos.length > 0) {
      terms.push(...novos.slice(0, 8));
      excerpt = selectExcerpt(content, terms);
    }

    if (!excerpt.trim()) return;
    excerpts.push({ path, content: excerpt });
    total += excerpt.length;
  }

  for (const paths of resolved.values()) {
    for (const path of paths) {
      if (excerpts.length >= MAX_FILES || total >= MAX_TOTAL_CHARS) break;
      if (excerpts.some((e) => e.path === path)) continue;

      const content = await read(path);
      if (content === null) continue;

      for (const ancestor of declaredAncestors(content)) ancestors.add(ancestor);
      add(path, content);
    }
  }

  /*
   * Segunda passada: os ancestrais dos objetos já lidos. É o que leva a análise
   * da tela até o user object onde a lógica mora — a lacuna que fez o
   * SMART-50927 girar em falso.
   */
  const pending = [...ancestors].filter(
    (name) => !objectNames.some((o) => o.toLowerCase() === name.toLowerCase()),
  );
  if (pending.length > 0 && excerpts.length < MAX_FILES && total < MAX_TOTAL_CHARS) {
    const resolvedAncestors = await resolveObjectPaths(module, pending);

    for (const paths of resolvedAncestors.values()) {
      for (const path of paths) {
        if (excerpts.length >= MAX_FILES || total >= MAX_TOTAL_CHARS) break;
        if (excerpts.some((e) => e.path === path)) continue;

        const content = await read(path);
        if (content !== null) add(path, content);
      }
    }
  }

  return { excerpts, notFound };
}
