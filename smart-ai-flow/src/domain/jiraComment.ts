import type { Card } from './card';

/**
 * Comentário de entrega no Jira, no template que o time usa.
 *
 * Duas regras deram forma a isto:
 *
 *  - **OBJETOS ALTERADOS sai do commit, não do modelo.** A lista vem dos
 *    arquivos que de fato foram commitados; a IA pode citar objeto que ela
 *    achou relevante e não mexeu, e comentário no Jira é registro oficial.
 *  - **EVIDÊNCIAS fica em branco, sempre.** É prova de teste executado, e a
 *    plataforma não testou nada. Preencher automaticamente seria a ferramenta
 *    afirmando dentro do Jira da empresa algo que ninguém verificou.
 */
export interface JiraCommentInput {
  card: Card;
  /** Caminhos que entraram no commit. */
  files: string[];
  prUrl?: string;
}

/** `ws_objects/Atende50/atende50.pbl.src/w_atende.srw` -> `w_atende (atende50)` */
export function describeObject(path: string): string {
  const parts = path.split(/[\\/]/);
  const file = parts[parts.length - 1] ?? path;
  const object = file.replace(/\.[^.]+$/, '');

  const lib = parts.find((p) => p.toLowerCase().endsWith('.pbl.src'));
  const libName = lib?.replace(/\.pbl\.src$/i, '');

  return libName ? `${object} (${libName})` : object;
}

const SYSTEM_LABEL: Record<string, string> = {
  smartdesktop: 'SMART Desktop',
  smartweb: 'SMART Web',
};

export function buildJiraComment({ card, files, prUrl }: JiraCommentInput): string {
  const system = SYSTEM_LABEL[card.module] ?? card.module.toUpperCase();

  // Biblioteca é a melhor pista de módulo que existe no caminho do arquivo.
  const libs = [
    ...new Set(
      files
        .map((f) => f.split(/[\\/]/).find((p) => p.toLowerCase().endsWith('.pbl.src')))
        .filter((l): l is string => !!l)
        .map((l) => l.replace(/\.pbl\.src$/i, '')),
    ),
  ];
  const modules = libs.length > 0 ? `${system} — ${libs.join(', ')}` : system;

  const objects = files.length > 0 ? files.map((f) => `- ${describeObject(f)}`).join('\n') : '';

  const technical = [card.analysis?.rootCause, card.proposal?.rationale]
    .filter(Boolean)
    .join('\n\n');

  return [
    'MÓDULOS IMPACTADOS:',
    modules,
    '',
    'OBJETOS ALTERADOS:',
    objects,
    '',
    'PR:',
    prUrl ?? '',
    '',
    'DESCRIÇÃO TÉCNICA:',
    technical,
    '',
    'DESCRIÇÃO RESUMIDA - CASO DE TESTES:',
    card.proposal?.testHint ?? '',
    '',
    'EVIDÊNCIAS:',
    '',
  ].join('\n');
}
