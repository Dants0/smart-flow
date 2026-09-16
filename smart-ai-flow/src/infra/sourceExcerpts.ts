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

/*
 * Orçamento de material. Subiu junto com a evidência: `w_agd03.srw` tem 282.540
 * caracteres, e com o teto anterior (24.000 por arquivo) o modelo recebia 8% da
 * janela. Ele então respondia "falta o trecho que abre o pop-up" — resposta
 * correta sobre um arquivo que ele quase não viu, e que o dev lia como
 * má vontade da IA.
 *
 * O teto real é a janela de contexto do modelo, não estes números: 240.000
 * caracteres são ~65 mil tokens de entrada, folgado em Sonnet 5. Entrada custa,
 * mas custa menos que um diff que não sai.
 */
const MAX_CHARS_PER_FILE = 96000;
const MAX_TOTAL_CHARS = 240000;
const MAX_FILES = 10;

/**
 * Orçamento por estágio. Os dois estágios precisam de coisas OPOSTAS:
 *
 * - a **proposta** precisa de PROFUNDIDADE: o bloco inteiro do evento que ela
 *   vai reescrever, senão o diff sai contra código que ninguém leu;
 * - a **análise** precisa de LARGURA: a cadeia de chamada atravessa objetos
 *   (evento → função de janela → `OpenWithParm` → `open` da janela genérica →
 *   função global), e parar no primeiro arquivo é justamente o que faz a
 *   análise culpar a propriedade do controle em vez do `open` de quem abre.
 *
 * Por isso a análise lê MAIS arquivos com MENOS de cada um.
 */
export interface GatherBudget {
  maxFiles: number;
  maxCharsPerFile: number;
  maxTotalChars: number;
}

export const PROPOSER_BUDGET: GatherBudget = {
  maxFiles: MAX_FILES,
  maxCharsPerFile: MAX_CHARS_PER_FILE,
  maxTotalChars: MAX_TOTAL_CHARS,
};

export const ANALYZER_BUDGET: GatherBudget = {
  maxFiles: 14,
  maxCharsPerFile: 32000,
  maxTotalChars: 140000,
};
/**
 * Teto de segurança: bloco maior que isso é cortado, mas COM AVISO.
 * Exportado pro teste acompanhar o valor em vez de fixar um número na mão —
 * subir o teto quebrou o teste que assumia 400.
 */
export const MAX_BLOCK_LINES = 800;
/** Linhas em volta de uma ocorrência que não é definição (ex: chamada). */
const CALL_CONTEXT = 12;
/** Teto de arquivos vindos da busca literal — complemento, não enxurrada. */
const MAX_GREP_HITS = 4;

/**
 * Fatia do orçamento RESERVADA à busca pelo texto que o usuário viu na tela.
 *
 * Não é um teto, é um piso: nenhum objeto citado pela análise pode consumi-la.
 * Ver o comentário longo em `gatherSourceMaterial` — sem essa reserva, dois
 * chutes grandes zeravam a única busca que sabia a resposta (SMART-52132).
 */
const RESERVA_BUSCA_LITERAL = 0.35;

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
export function selectExcerpt(
  content: string,
  terms: string[],
  maxChars: number = MAX_CHARS_PER_FILE,
): string {
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
      .slice(0, maxChars);
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
    if (total + block.length > maxChars) {
      ignorados++;
      continue;
    }

    // Aviso explícito de corte: o modelo precisa saber que está raciocinando
    // sobre um trecho incompleto, em vez de supor que viu o bloco todo.
    parts.push(cut.has(start) ? `${block}\n[CORTADO: o bloco continua além da linha ${end + 1}]` : block);
    total += block.length;
  }

  if (ignorados > 0) {
    /*
     * O aviso diz o que FAZER, não só o que faltou. Antes era um beco sem saída:
     * o modelo lia "89 trechos não incluídos" e respondia, com razão, que faltava
     * material (SMART-52132). Agora falta material é problema que ele resolve
     * sozinho — este orçamento corta o material PRÉ-CARREGADO, e `ler_fonte` não
     * passa por ele.
     */
    parts.push(
      `[${ignorados} trecho(s) relevante(s) não couberam no orçamento deste arquivo — ` +
        'use ler_fonte neste caminho, na faixa de linhas que te interessa, para ver o resto]',
    );
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
 * Textos entre aspas citados no chamado ou na análise — `'Visualizar
 * (Instruções)'`, `"Deseja prosseguir?"`.
 *
 * É o que liga a queixa do usuário ao objeto que desenha a tela: o título da
 * janela e o texto do botão estão no fonte, literalmente. Sem isto a busca só
 * enxergava identificadores no estilo PowerBuilder (`w_agd03`,
 * `wf_buscar_instrucoes`) e nunca chegava na janela do pop-up quando a análise
 * não sabia o nome dela — que é justamente quando o dev mais precisa.
 */
export function extractQuotedLiterals(text: string): string[] {
  const found = new Set<string>();

  for (const m of text.matchAll(/["'“”]([^"'“”\n]{6,60})["'“”]/g)) {
    const valor = m[1].trim();
    // precisa parecer texto de tela: tem letra e não é caminho nem identificador
    if (!/[a-zà-ú]/i.test(valor)) continue;
    if (/[\\/]/.test(valor)) continue;
    if (/^[a-z]{1,4}_[a-z0-9_]+$/i.test(valor)) continue;
    found.add(valor);
  }

  return [...found].slice(0, 5);
}

/**
 * Pedaço ASCII mais longo de um literal, pra usar como alternativa na busca.
 *
 * "Visualizar (Instruções)" com acento depende da codificação com que o fonte
 * foi exportado; "Visualizar" não depende de nada. Busca que falha por causa de
 * um cedilha é indistinguível, pra quem lê o resultado, de objeto inexistente.
 */
export function asciiFallback(literal: string): string | null {
  // Trecho CONTÍGUO, não a maior palavra: "Visualizar (Instru" só casa com a
  // tela certa, enquanto "Visualizar" casa com todo botão do sistema — foi o
  // que encheu o material com quatro telas de auditoria sem relação com o
  // chamado, roubando o orçamento de quem tinha o código.
  const trechos = literal.split(/[^\x20-\x7E]+/).map((t) => t.trim());
  const maior = trechos.sort((a, b) => b.length - a.length)[0];
  return maior && maior.length >= 8 ? maior : null;
}

/**
 * Termos que o material CITA mas não DEFINE.
 *
 * A análise do SMART-51229 terminou pedindo "quem chama wf_seleciona_horario" —
 * pergunta que a plataforma sabe responder sozinha com um grep, e que antes
 * virava tarefa manual do dev.
 */
export function termsWithoutDefinition(excerpts: SourceExcerpt[], terms: string[]): string[] {
  const todoOCodigo = excerpts.map((e) => e.content).join('\n');
  const linhas = todoOCodigo.split('\n');

  const minusculo = todoOCodigo.toLowerCase();

  return terms.filter((term) => {
    if (term.length < 6) return false;
    // nem citado no material: não é lacuna, é ruído
    if (!minusculo.includes(term.toLowerCase())) return false;
    return !linhas.some((linha) => isDefinitionStart(linha, term));
  });
}


/**
 * Arquivos do repositório que MENCIONAM algum destes textos.
 *
 * `git grep` em vez do índice do RAG de propósito: aqui a pergunta é literal
 * ("quem escreve esta frase", "quem chama esta função"), e busca exata responde
 * isso melhor que similaridade — que traz o parecido e erra o idêntico.
 */
async function filesMentioning(repoRoot: string, patterns: string[]): Promise<string[]> {
  if (patterns.length === 0) return [];

  const args = [
    'grep',
    '--no-color',
    '-l', // só os nomes
    '-i',
    '-F', // texto literal, não regex: parênteses de 'Visualizar (Instruções)'
    ...patterns.flatMap((p) => ['-e', p]),
    'HEAD',
    '--',
    '*.srw',
    '*.sru',
    '*.sra',
    '*.srd',
    '*.srm',
    '*.srq',
    '*.srs',
    '*.srf',
  ];

  try {
    const { stdout } = await exec('git', args, {
      cwd: repoRoot,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 60_000,
    });
    // saída vem como "HEAD:ws_objects/.../w_x.srw"
    return stdout
      .split('\n')
      .map((l) => l.trim().replace(/^HEAD:/, ''))
      .filter(Boolean)
      .slice(0, MAX_GREP_HITS);
  } catch {
    // exit 1 = nenhum resultado, e qualquer outra falha não pode derrubar a
    // proposta: esta busca é complemento, não fundação
    return [];
  }
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
  budget: GatherBudget = PROPOSER_BUDGET,
): Promise<SourceMaterial> {
  const repo = repoForModule(module);
  if (!repo.root) return { excerpts: [], notFound: objectNames };

  // termos crescem conforme a leitura: começam no chamado/análise e ganham o
  // que o próprio código revela (eventos, funções chamadas, flags)
  const terms = extractIdentifiers(contextText);
  /*
   * Cópia dos termos que vieram DO CHAMADO/ANÁLISE. Só eles viram busca no
   * repositório: os colhidos do código já estão satisfeitos no arquivo que os
   * revelou, e são genéricos o bastante (`of_get_row`, `i_sistema`) pra casar
   * com meio sistema — foi o que trouxe quatro telas de auditoria sem relação
   * com o chamado.
   */
  const termosDoContexto = [...terms];

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
    let excerpt = selectExcerpt(content, terms, budget.maxCharsPerFile);

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
      excerpt = selectExcerpt(content, terms, budget.maxCharsPerFile);
    }

    if (!excerpt.trim()) return;
    excerpts.push({ path, content: excerpt });
    total += excerpt.length;
  }

  /*
   * PRIMEIRA passada: o texto que o usuário VIU na tela.
   *
   * Vem antes de tudo, e com orçamento RESERVADO, por causa do SMART-52132. A
   * análise chutou `w_atende.srw` (531 mil caracteres) e `w_smk01_n.srw` (116
   * mil); os dois chutes, truncados em 96 mil cada, mais o .srd da aba, comeram
   * 222.880 dos 240.000 caracteres. A busca literal — que estava logo abaixo,
   * atrás de um `if (total < maxTotalChars)` — nunca rodou.
   *
   * E ela era a resposta: `git grep "ado em conjunto com o item"` devolve
   * `u_nv_gera_os.sru` e `u_dw_smm.sru`, os dois arquivos certos, e nada mais.
   * O card terminou pedindo ao dev um trecho que a plataforma tinha a um comando
   * de distância.
   *
   * A lição não é "aumente o orçamento": é que busca dirigida pela evidência tem
   * precedência sobre palpite, e precedência que depende de sobra não é
   * precedência. Por isso a reserva abaixo é intocável pelos chutes.
   */
  const literais = extractQuotedLiterals(contextText);
  if (literais.length > 0) {
    const reserva = Math.floor(budget.maxTotalChars * RESERVA_BUSCA_LITERAL);
    const padroes = [
      ...literais,
      ...literais.map(asciiFallback).filter((p): p is string => p !== null),
    ];

    for (const path of await filesMentioning(repo.root, padroes)) {
      if (excerpts.length >= budget.maxFiles || total >= reserva) break;
      if (excerpts.some((e) => e.path === path)) continue;

      const content = await read(path);
      if (content === null) continue;

      // o literal também vira termo de recorte: é ele que marca o trecho certo
      // dentro de um arquivo que pode ter milhares de linhas
      for (const literal of literais) {
        if (!terms.some((t) => t.toLowerCase() === literal.toLowerCase())) terms.push(literal);
      }
      for (const ancestor of declaredAncestors(content)) ancestors.add(ancestor);
      add(path, content);
    }
  }

  for (const paths of resolved.values()) {
    for (const path of paths) {
      if (excerpts.length >= budget.maxFiles || total >= budget.maxTotalChars) break;
      if (excerpts.some((e) => e.path === path)) continue;

      const content = await read(path);
      if (content === null) continue;

      for (const ancestor of declaredAncestors(content)) ancestors.add(ancestor);
      add(path, content);
    }
  }

  /*
   * Segunda passada: "quem chama esta função" — termo que o material CITA e não
   * DEFINE. Diferente da primeira, esta só faz sentido DEPOIS de ler os objetos,
   * porque é o conteúdo deles que revela o símbolo faltante.
   *
   * Continua antes dos ancestrais porque é dirigida: um arquivo que menciona o
   * símbolo que falta é mais provável de conter a resposta que um ancestral
   * genérico. Medido no SMART-51229: os ancestrais (`u_datawindow_padrao`,
   * `u_dw_pac`) sozinhos comeram 164 mil dos 240 mil do orçamento.
   */
  if (excerpts.length < budget.maxFiles && total < budget.maxTotalChars) {
    const semDefinicao = termsWithoutDefinition(excerpts, termosDoContexto);

    for (const path of await filesMentioning(repo.root, semDefinicao)) {
      if (excerpts.length >= budget.maxFiles || total >= budget.maxTotalChars) break;
      if (excerpts.some((e) => e.path === path)) continue;

      const content = await read(path);
      if (content === null) continue;

      for (const termo of semDefinicao) {
        if (!terms.some((t) => t.toLowerCase() === termo.toLowerCase())) terms.push(termo);
      }
      add(path, content);
    }
  }

  /*
   * Terceira passada: os ancestrais dos objetos já lidos. É o que leva a análise
   * da tela até o user object onde a lógica mora — a lacuna que fez o
   * SMART-50927 girar em falso. Fica por último porque é a mais larga: entra com
   * o orçamento que sobrar depois do material dirigido.
   */
  const pending = [...ancestors].filter(
    (name) => !objectNames.some((o) => o.toLowerCase() === name.toLowerCase()),
  );
  if (pending.length > 0 && excerpts.length < budget.maxFiles && total < budget.maxTotalChars) {
    const resolvedAncestors = await resolveObjectPaths(module, pending);

    for (const paths of resolvedAncestors.values()) {
      for (const path of paths) {
        if (excerpts.length >= budget.maxFiles || total >= budget.maxTotalChars) break;
        if (excerpts.some((e) => e.path === path)) continue;

        const content = await read(path);
        if (content !== null) add(path, content);
      }
    }
  }

  return { excerpts, notFound };
}

// ---- Inventário de reuso ----------------------------------------------

/**
 * Quem mais toca um objeto — a pergunta do Passo 4 do protocolo.
 *
 * Sem isso a correção sai certa e incompleta, ou certa e destrutiva, e nos dois
 * casos o chamado volta. Dois exemplos reais do SMART-51229:
 *
 *  - `w_agd03.wf_exibir_instrucoes` não era o único ponto de entrada: o layout
 *    legado entra por `m_sheet.mf_buscar_agds`. Corrigir só um deixaria metade
 *    dos operadores vendo o texto truncado.
 *  - `w_exibe_inst` é compartilhada com o Lab (`u_dw_smm_lab`). Mudar a janela
 *    direto mudaria uma tela que ninguém pediu pra mexer — por isso a alteração
 *    entrou condicionada a um marcador opcional no parâmetro.
 *
 * É de propósito uma LISTA DE CAMINHOS, sem código: cabe em poucas centenas de
 * tokens, e o que o modelo precisa saber aqui é "existe outro consumidor?",
 * não o corpo dele.
 */
export interface ReuseHit {
  /** Nome do objeto pesquisado. */
  object: string;
  /** Arquivos que citam o objeto, sem contar o fonte que o define. */
  paths: string[];
  /** true = há mais consumidores além dos listados. */
  truncated: boolean;
}

/** Teto por objeto: o suficiente pra dizer "é compartilhado", sem virar lista. */
const MAX_REUSE_PATHS = 12;
/** Teto de objetos pesquisados: cada um é um `git grep` no repositório inteiro. */
const MAX_REUSE_OBJECTS = 6;

/** Nome do objeto a partir do caminho: `.../w_agd03.srw` -> `w_agd03`. */
function objectOfPath(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1);
  return file.replace(/\.[^.]+$/, '').toLowerCase();
}

async function filesReferencing(repoRoot: string, name: string): Promise<string[]> {
  const args = [
    'grep',
    '--no-color',
    '-l',
    '-i',
    '-w', // `w_agd03` não casa dentro de `w_agd03_novo`
    '-F',
    '-e',
    name,
    'HEAD',
    '--',
    '*.srw',
    '*.sru',
    '*.sra',
    '*.srd',
    '*.srm',
    '*.srq',
    '*.srs',
    '*.srf',
  ];

  try {
    const { stdout } = await exec('git', args, {
      cwd: repoRoot,
      maxBuffer: 8 * 1024 * 1024,
      timeout: 60_000,
    });
    return stdout
      .split('\n')
      .map((l) => l.trim().replace(/^HEAD:/, ''))
      .filter(Boolean);
  } catch {
    // exit 1 = nenhum resultado. Qualquer outra falha também não pode derrubar
    // a análise: o inventário é informação a mais, nunca fundação.
    return [];
  }
}

/**
 * Para cada objeto, os outros fontes que o citam. Best-effort: repositório
 * indisponível devolve lista vazia, e o prompt simplesmente não ganha a seção.
 */
export async function reuseInventory(module: string, objectNames: string[]): Promise<ReuseHit[]> {
  const repo = repoForModule(module);
  if (!repo.root) return [];

  const nomes = [
    ...new Set(
      objectNames
        .map((raw) =>
          raw
            .toLowerCase()
            .replace(/\.[a-z]{3}$/, '')
            .replace(/\s*\(.*\)\s*/, '')
            .trim(),
        )
        // nome curto demais grepa o repositório inteiro e não diz nada
        .filter((n) => /^[a-z][\w]{4,}$/.test(n)),
    ),
  ].slice(0, MAX_REUSE_OBJECTS);

  // Em paralelo: cada busca varre o repositório inteiro (~16 mil arquivos no
  // SMART Desktop), e seis delas em fila somariam dezenas de segundos ao estágio.
  const resultados = await Promise.all(
    nomes.map(async (nome) => ({
      nome,
      // o próprio fonte do objeto sempre casa; ele não é "outro consumidor"
      encontrados: (await filesReferencing(repo.root as string, nome)).filter(
        (p) => objectOfPath(p) !== nome,
      ),
    })),
  );

  return resultados
    .filter((r) => r.encontrados.length > 0)
    .map(({ nome, encontrados }) => ({
      object: nome,
      paths: encontrados.slice(0, MAX_REUSE_PATHS),
      truncated: encontrados.length > MAX_REUSE_PATHS,
    }));
}

/** Bloco pronto pro prompt. String vazia quando não há nada a dizer. */
export function formatReuseInventory(hits: ReuseHit[]): string {
  if (hits.length === 0) return '';

  const linhas = hits.map((h) => {
    const extra = h.truncated ? ` (+ outros além destes ${h.paths.length})` : '';
    return `## ${h.object} — ${h.paths.length} outro(s) fonte(s) citam${extra}\n${h.paths
      .map((p) => `- ${p}`)
      .join('\n')}`;
  });

  return [
    '',
    '# Inventário de reuso (quem mais toca estes objetos)',
    'Lista de caminhos, sem código — vinda de `git grep` no repositório, não de',
    'suposição. Serve pra DUAS perguntas, e as duas mudam a proposta:',
    '',
    '1. **Quem me chama?** Mais de um ponto de entrada = todos entram no diff, ou',
    '   o chamado volta com "só corrigiu na tela nova".',
    '2. **Quem mais usa o que eu vou alterar?** Objeto citado por vários módulos é',
    '   compartilhado: a alteração tem que ser CONDICIONAL, com o caminho antigo',
    '   intacto por padrão, e a regressão dos outros consumidores entra no teste.',
    '',
    ...linhas,
    '',
  ].join('\n');
}
