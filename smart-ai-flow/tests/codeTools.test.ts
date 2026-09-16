import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Repositório de mentira, com a forma do SMART Desktop, pra exercitar as
 * ferramentas de investigação contra `git` de verdade.
 *
 * O cenário é o SMART-52132, encolhido:
 *  - a mensagem que o usuário vê mora em `u_nv_gera_os.sru`, dentro de
 *    `aplgen50` — biblioteca que o briefing do módulo ATENDE nem cita;
 *  - o fonte está gravado em Latin-1, como boa parte do codebase real, então a
 *    busca pelo texto acentuado falha e só o trecho sem acento acha;
 *  - existem três objetos grandes que uma análise errada citaria, e que sozinhos
 *    estouram o orçamento de caracteres.
 */

let repoRoot: string;

const CAMINHO_ALVO = 'ws_objects/aplgen50/aplg50_2/aplg50_2.pbl.src/u_nv_gera_os.sru';
const MENSAGEM = "sMsg = \"O item '\" + p_ssmkcod + \"' não pode ser lançado em conjunto com o item '\"";

function git(args: string[]): void {
  execFileSync('git', args, { cwd: repoRoot, stdio: 'pipe' });
}

function escreve(caminho: string, conteudo: string, encoding: BufferEncoding = 'utf8'): void {
  const destino = join(repoRoot, caminho);
  mkdirSync(join(destino, '..'), { recursive: true });
  writeFileSync(destino, conteudo, encoding);
}

/**
 * Objeto grande com MUITAS ocorrências espaçadas do termo: é assim que um fonte
 * PowerBuilder come o orçamento — dezenas de blocos pequenos, não um bloco só.
 */
function objetoGrande(nome: string): string {
  const linhas = [`$PBExportHeader$${nome}.srw`, `global type ${nome} from window`, 'end type', ''];
  for (let i = 0; i < 300; i++) {
    linhas.push(`  ll_total = smm_cod + ${i}`);
    for (let j = 0; j < 30; j++) linhas.push('  // preenchimento');
  }
  return linhas.join('\n');
}

beforeAll(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'smartflow-repo-'));
  execFileSync('git', ['init', '-q'], { cwd: repoRoot, stdio: 'pipe' });
  git(['config', 'user.email', 'teste@exemplo.com']);
  git(['config', 'user.name', 'teste']);

  escreve(
    CAMINHO_ALVO,
    [
      '$PBExportHeader$u_nv_gera_os.sru',
      'forward prototypes',
      'public function boolean uof_valid_rmc_com_str (long p_nosmserie)',
      'end prototypes',
      '',
      'public function boolean uof_valid_rmc_com_str (long p_nosmserie);STRING sTeste',
      '',
      'SELECT MAX ( smm_cod ) INTO :sTeste FROM smm, rmc',
      '  WHERE ( smm_osm_serie = :p_nosmserie ) ;',
      '',
      `\t\t\t${MENSAGEM}`,
      '\t\t\tMessageBox ( "Atenção", sMsg, Exclamation! )',
      'RETURN TRUE',
      'end function',
    ].join('\n'),
    // Latin-1 de propósito: é a condição real que faz a busca acentuada falhar.
    'latin1',
  );

  for (const nome of ['w_grande_1', 'w_grande_2', 'w_grande_3']) {
    escreve(`ws_objects/atende50/repaca50/repaca50.pbl.src/${nome}.srw`, objetoGrande(nome));
  }

  git(['add', '-A']);
  git(['commit', '-qm', 'base']);
  // `git init` + `commit` no Windows passa fácil dos 5s padrão quando a suíte
  // inteira roda junto — sem este teto o arquivo falhava de forma intermitente.
}, 60_000);

afterAll(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

/** Recarrega os módulos com o repositório de teste montado (o env é lido no import). */
async function carregar() {
  vi.resetModules();
  process.env.SMART_DESKTOP_PATH = repoRoot;
  const codeTools = await import('../src/infra/codeTools');
  const sourceExcerpts = await import('../src/infra/sourceExcerpts');
  return { codeTools, sourceExcerpts };
}

describe('ferramentas de investigação do repositório', () => {
  it('acha o arquivo pela mensagem que o usuário viu na tela', async () => {
    const { codeTools } = await carregar();
    const toolset = codeTools.buildCodeToolset('atende')!;

    const saida = await toolset.runTool('buscar_no_codigo', {
      texto: 'pode ser lan',
    });

    expect(saida).toContain(CAMINHO_ALVO);
    // com número de linha: é o que permite o ler_fonte seguinte
    expect(saida).toMatch(/u_nv_gera_os\.sru:\d+:/);
  });

  it('cai no trecho sem acento quando o fonte está em Latin-1', async () => {
    const { codeTools } = await carregar();
    const toolset = codeTools.buildCodeToolset('atende')!;

    // a frase acentuada não casa byte a byte com o fonte Latin-1
    const saida = await toolset.runTool('buscar_no_codigo', {
      texto: 'não pode ser lançado em conjunto com o item',
    });

    expect(saida).toContain(CAMINHO_ALVO);
    expect(saida).toContain('sem acento');
  });

  it('avisa em vez de falhar quando o texto não existe', async () => {
    const { codeTools } = await carregar();
    const toolset = codeTools.buildCodeToolset('atende')!;

    const saida = await toolset.runTool('buscar_no_codigo', { texto: 'jamais escrito aqui' });
    expect(saida).toContain('Nenhuma ocorrência');
  });

  it('lê a faixa de linhas pedida, numerada', async () => {
    const { codeTools } = await carregar();
    const toolset = codeTools.buildCodeToolset('atende')!;

    const saida = await toolset.runTool('ler_fonte', { caminho: CAMINHO_ALVO, de: 6, ate: 9 });

    expect(saida).toContain('linhas 6-9');
    expect(saida).toContain('uof_valid_rmc_com_str');
    expect(saida).toContain('8\tSELECT MAX ( smm_cod )');
    // fora da faixa não vem
    expect(saida).not.toContain('RETURN TRUE');
  });

  it('caminho inexistente vira recado, não exceção — senão derruba a rodada inteira', async () => {
    const { codeTools } = await carregar();
    const toolset = codeTools.buildCodeToolset('atende')!;

    const saida = await toolset.runTool('ler_fonte', { caminho: 'ws_objects/nao/existe.sru' });
    expect(saida).toContain('não existe no repositório');
  });

  it('resolve o caminho real de um objeto pelo nome', async () => {
    const { codeTools } = await carregar();
    const toolset = codeTools.buildCodeToolset('atende')!;

    expect(await toolset.runTool('buscar_objeto', { nome: 'u_nv_gera_os' })).toBe(CAMINHO_ALVO);
  });

  it('nome inventado volta vazio — é como o modelo confirma que imaginou', async () => {
    const { codeTools } = await carregar();
    const toolset = codeTools.buildCodeToolset('atende')!;

    const saida = await toolset.runTool('buscar_objeto', { nome: 'f_valida_obito_paciente' });
    expect(saida).toContain('Nenhum objeto');
  });

  it('ferramenta desconhecida não explode', async () => {
    const { codeTools } = await carregar();
    const toolset = codeTools.buildCodeToolset('atende')!;

    expect(await toolset.runTool('rm_rf', {})).toContain('não existe');
  });

  it('sem repositório montado não oferece ferramenta que sempre falharia', async () => {
    vi.resetModules();
    process.env.SMART_DESKTOP_PATH = '';
    const { buildCodeToolset } = await import('../src/infra/codeTools');
    expect(buildCodeToolset('atende')).toBeNull();
  });
});

describe('reserva de orçamento para a busca pelo texto de tela (SMART-52132)', () => {
  it('o arquivo achado pelo literal entra mesmo com objetos grandes citados antes', async () => {
    const { sourceExcerpts } = await carregar();

    const contexto = [
      'O sistema não bloqueia o lançamento em OS diferentes no mesmo dia.',
      'A tela mostra "não pode ser lançado em conjunto com o item" e mesmo assim grava.',
      'Verificar smm_cod na gravação.',
    ].join('\n');

    const material = await sourceExcerpts.gatherSourceMaterial(
      'atende',
      // o palpite errado da análise: três objetos enormes, que sozinhos
      // estouravam o orçamento e faziam a busca literal nunca rodar
      ['w_grande_1', 'w_grande_2', 'w_grande_3'],
      contexto,
    );

    const caminhos = material.excerpts.map((e) => e.path);
    expect(caminhos).toContain(CAMINHO_ALVO);
  });

  it('os objetos citados pela análise continuam vindo', async () => {
    const { sourceExcerpts } = await carregar();

    const material = await sourceExcerpts.gatherSourceMaterial(
      'atende',
      ['w_grande_1'],
      'ocorrência de smm_cod na tela',
    );

    expect(material.excerpts.some((e) => e.path.includes('w_grande_1'))).toBe(true);
    expect(material.notFound).toEqual([]);
  });
});
