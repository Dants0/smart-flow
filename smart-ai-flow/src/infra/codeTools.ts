import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { repoForModule } from './repos';
import { asciiFallback } from './sourceExcerpts';
import { resolveObjectPaths, searchObjects } from './objectIndex';
import type { LlmTool } from './llm';

const exec = promisify(execFile);

/**
 * As ferramentas que a IA usa para investigar o repositório SOZINHA.
 *
 * Existe por causa de uma falha medida no SMART-52132. A esteira montava todo o
 * contexto ANTES do modelo pensar: a análise chutava os objetos, o pipeline lia
 * os arquivos desses chutes, e não havia segunda rodada. Chute errado = as duas
 * chamadas erravam juntas.
 *
 * Naquele card o chute foi `w_atende.srw` (531 mil caracteres, o maior objeto do
 * ATENDE). O código da restrição morava em `u_nv_gera_os.sru`, em `aplgen50` —
 * biblioteca que o briefing do módulo nem cita. E o pior: a busca literal que
 * teria achado em um comando (`git grep "ado em conjunto com o item"` devolve os
 * dois arquivos certos e nada mais) ficou de fora porque os chutes já tinham
 * comido 222 mil dos 240 mil caracteres de orçamento.
 *
 * A correção não é um orçamento maior — é inverter quem decide. Com estas três
 * ferramentas o modelo busca, lê o resultado e decide a busca seguinte com o que
 * aprendeu, que é como um dev trabalha com um terminal na frente.
 *
 * Sai mais barato, não mais caro: hoje empilhamos 96 mil caracteres de um
 * arquivo que o modelo mal usa; com ferramenta ele lê as 200 linhas da função e
 * para.
 *
 * Tudo aqui é SOMENTE LEITURA e sempre contra `HEAD` — a esteira não escreve no
 * repositório do cliente em nenhuma hipótese (ver CLAUDE.md, "IA propõe, dev
 * decide").
 */

/** Tetos de saída. Protegem a janela de contexto, não a carteira. */
const MAX_LINHAS_BUSCA = 40;
const MAX_LINHAS_LEITURA = 600;
const MAX_CHARS_RESULTADO = 40000;

/** Extensões de fonte exportado do PowerBuilder. `.srf` são 1.808 arquivos. */
const FONTES = ['*.sru', '*.srw', '*.srf', '*.srd', '*.sra', '*.srm', '*.srq', '*.srs'];

export const CODE_TOOLS: LlmTool[] = [
  {
    name: 'buscar_no_codigo',
    description: [
      'Busca um texto LITERAL em todos os fontes do repositório e devolve',
      'arquivo, número da linha e a linha. É a ferramenta mais certeira que você',
      'tem: mensagem de erro que aparece no print, título de janela, nome de',
      'função, nome de coluna do banco.',
      '',
      'Busque o PREFIXO da frase, nunca a frase inteira — mensagem de tela é',
      'concatenada em runtime, então a frase completa não existe em lugar nenhum',
      'do fonte. Acento é tratado sozinho: se a busca com acento não achar nada,',
      'o maior trecho sem acento é tentado automaticamente (o fonte alterna',
      'Latin-1 e UTF-8, e o match falha em silêncio).',
    ].join('\n'),
    input_schema: {
      type: 'object',
      properties: {
        texto: {
          type: 'string',
          description: 'Texto literal a procurar. Não é regex.',
        },
        extensoes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Opcional. Restringe as extensões, ex.: ["*.sru"]. Por padrão busca em todos os fontes.',
        },
      },
      required: ['texto'],
    },
  },
  {
    name: 'ler_fonte',
    description: [
      'Lê um trecho de um fonte, com número de linha. Passe SEMPRE uma faixa:',
      'objeto PowerBuilder passa de 400 mil caracteres, e ler do começo gasta a',
      'janela inteira com o bloco de `forward prototypes`, que é só assinatura.',
      '',
      'Fluxo que funciona: `buscar_no_codigo` devolve a linha, você lê a faixa em',
      'volta dela. Corpo de função corre PRA BAIXO a partir da assinatura.',
    ].join('\n'),
    input_schema: {
      type: 'object',
      properties: {
        caminho: {
          type: 'string',
          description:
            'Caminho relativo à raiz do repositório, ex.: ws_objects/aplgen50/aplg50_2/aplg50_2.pbl.src/u_nv_gera_os.sru',
        },
        de: { type: 'number', description: 'Primeira linha (1-based). Padrão: 1.' },
        ate: { type: 'number', description: 'Última linha. Padrão: de + 300.' },
      },
      required: ['caminho'],
    },
  },
  {
    name: 'buscar_objeto',
    description: [
      'Descobre o CAMINHO REAL de um objeto pelo nome (`u_dw_smm`, `w_smk01_n`,',
      '`d_rmc01tab_cad`). Aceita nome parcial.',
      '',
      'Use quando souber o nome mas não a biblioteca — que é a regra no SMART,',
      'onde o objeto que resolve o chamado do ATENDE costuma morar em `aplgen50`.',
      'Nome que não existe volta lista vazia: é assim que você confirma que um',
      'objeto é imaginação sua ANTES de citá-lo na resposta.',
    ].join('\n'),
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome ou fragmento do nome do objeto.' },
      },
      required: ['nome'],
    },
  },
];

/** Corta a saída de uma ferramenta e avisa o que ficou de fora. */
function linhasLimitadas(texto: string, max: number): string {
  const linhas = texto.split('\n').filter(Boolean);
  const cortadas = linhas.slice(0, max);
  const sobra = linhas.length - cortadas.length;
  const corpo = cortadas.join('\n').slice(0, MAX_CHARS_RESULTADO);
  return sobra > 0
    ? `${corpo}\n\n[+${sobra} ocorrência(s) não listada(s) — refine o texto da busca]`
    : corpo;
}

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 60_000,
  });
  return stdout;
}

async function buscarNoCodigo(root: string, texto: string, extensoes?: string[]): Promise<string> {
  const globs = extensoes?.length ? extensoes : FONTES;

  async function grep(padrao: string): Promise<string> {
    try {
      return await git(root, [
        'grep',
        '--no-color',
        '-n', // número da linha: é o que permite o ler_fonte seguinte
        '-i',
        '-F', // literal, não regex
        '-e',
        padrao,
        'HEAD',
        '--',
        ...globs,
      ]);
    } catch {
      // saída 1 = nenhuma ocorrência; qualquer outra falha também vira "vazio",
      // porque ferramenta que lança exceção derruba a rodada inteira do modelo
      return '';
    }
  }

  let saida = await grep(texto);
  let usouFallback = false;

  // Acento é a causa número 1 de busca que falha em silêncio neste codebase.
  if (!saida.trim()) {
    const semAcento = asciiFallback(texto);
    if (semAcento && semAcento !== texto) {
      saida = await grep(semAcento);
      usouFallback = Boolean(saida.trim());
    }
  }

  if (!saida.trim()) {
    return `Nenhuma ocorrência de "${texto}" nos fontes. Tente um prefixo mais curto (mensagem de tela é concatenada em runtime) ou um trecho sem a parte acentuada.`;
  }

  const limpo = saida
    .split('\n')
    .map((l) => l.replace(/^HEAD:/, ''))
    .join('\n');

  const aviso = usouFallback
    ? '[a busca com acento não achou nada; o resultado abaixo é do trecho sem acento]\n'
    : '';

  return aviso + linhasLimitadas(limpo, MAX_LINHAS_BUSCA);
}

async function lerFonte(root: string, caminho: string, de?: number, ate?: number): Promise<string> {
  let conteudo: string;
  try {
    conteudo = await git(root, ['show', `HEAD:${caminho}`]);
  } catch {
    return `Caminho "${caminho}" não existe no repositório. Use buscar_objeto para descobrir o caminho real.`;
  }

  const linhas = conteudo.split('\n');
  const inicio = Math.max(1, de ?? 1);
  const fim = Math.min(linhas.length, ate ?? inicio + 300);

  if (inicio > linhas.length) {
    return `O arquivo "${caminho}" tem ${linhas.length} linhas — a faixa pedida começa depois do fim.`;
  }

  const total = fim - inicio + 1;
  if (total > MAX_LINHAS_LEITURA) {
    return `Faixa de ${total} linhas é grande demais (teto ${MAX_LINHAS_LEITURA}). O arquivo tem ${linhas.length} linhas — peça um trecho menor.`;
  }

  const corpo = linhas
    .slice(inicio - 1, fim)
    .map((l, i) => `${inicio + i}\t${l}`)
    .join('\n')
    .slice(0, MAX_CHARS_RESULTADO);

  return `## ${caminho} (linhas ${inicio}-${fim} de ${linhas.length})\n${corpo}`;
}

async function buscarObjeto(module: string, nome: string): Promise<string> {
  const exato = await resolveObjectPaths(module, [nome]);
  const caminhos = exato.get(nome) ?? [];
  if (caminhos.length > 0) return caminhos.join('\n');

  const parciais = await searchObjects(module, nome);
  if (parciais.length > 0) {
    return `Nenhum objeto com o nome exato "${nome}". Parecidos:\n${parciais.join('\n')}`;
  }
  return `Nenhum objeto "${nome}" no repositório — não cite esse nome na resposta.`;
}

export interface CodeToolset {
  tools: LlmTool[];
  runTool: (name: string, input: unknown) => Promise<string>;
}

/**
 * Prepara as ferramentas para um módulo. Devolve `null` quando o repositório não
 * está montado — aí a esteira roda como antes, só com o material pré-carregado,
 * em vez de oferecer ao modelo uma ferramenta que sempre falha.
 */
export function buildCodeToolset(module: string): CodeToolset | null {
  const repo = repoForModule(module);
  if (!repo.root) return null;

  return {
    tools: CODE_TOOLS,
    async runTool(name, input) {
      const args = (input ?? {}) as Record<string, unknown>;
      switch (name) {
        case 'buscar_no_codigo': {
          const texto = typeof args.texto === 'string' ? args.texto.trim() : '';
          if (!texto) return 'Parâmetro "texto" é obrigatório.';
          const ext = Array.isArray(args.extensoes)
            ? args.extensoes.filter((e): e is string => typeof e === 'string')
            : undefined;
          return buscarNoCodigo(repo.root, texto, ext);
        }
        case 'ler_fonte': {
          const caminho = typeof args.caminho === 'string' ? args.caminho.trim() : '';
          if (!caminho) return 'Parâmetro "caminho" é obrigatório.';
          const de = typeof args.de === 'number' ? args.de : undefined;
          const ate = typeof args.ate === 'number' ? args.ate : undefined;
          return lerFonte(repo.root, caminho, de, ate);
        }
        case 'buscar_objeto': {
          const nome = typeof args.nome === 'string' ? args.nome.trim() : '';
          if (!nome) return 'Parâmetro "nome" é obrigatório.';
          return buscarObjeto(module, nome);
        }
        default:
          return `Ferramenta "${name}" não existe. Disponíveis: ${CODE_TOOLS.map((t) => t.name).join(', ')}.`;
      }
    },
  };
}
