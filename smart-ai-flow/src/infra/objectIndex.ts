import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { repoForModule, type RepoConfig } from './repos';

const exec = promisify(execFile);

/**
 * Índice dos arquivos que existem de verdade no repositório.
 *
 * Existe por causa de uma falha real: numa análise do SMART-50927 o modelo
 * propôs um diff inteiro contra `MWSUS50/mwsus50.pbl.src/f_valida_obito_paciente.srf`
 * — arquivo, função e pasta que **não existem**. O RAG não trouxe o código, e o
 * modelo preencheu a lacuna com nomes plausíveis.
 *
 * Duas defesas saem daqui:
 *  - **antes**: o prompt do proposer recebe os caminhos REAIS dos objetos que a
 *    análise citou, em vez de deixar o modelo adivinhar;
 *  - **depois**: todo caminho do diff é conferido contra este índice, e o que
 *    não existe vira aviso no card.
 */

/** O índice muda só quando o dev troca de branch ou puxa código novo. */
const TTL_MS = 5 * 60 * 1000;

interface Index {
  /** Todos os caminhos rastreados, relativos à raiz. */
  paths: Set<string>;
  /** nome do objeto (sem extensão, minúsculo) -> caminhos */
  byObject: Map<string, string[]>;
  builtAt: number;
}

/** Um índice por repositório: os dois sistemas têm layouts diferentes. */
const cache = new Map<string, Index>();

async function build(repo: RepoConfig): Promise<Index> {
  const { stdout } = await exec('git', ['ls-files'], {
    cwd: repo.root,
    maxBuffer: 32 * 1024 * 1024, // ~16 mil arquivos no SMART Desktop
    timeout: 60_000,
  });

  const paths = new Set<string>();
  const byObject = new Map<string, string[]>();

  for (const line of stdout.split('\n')) {
    const path = line.trim();
    if (!path) continue;
    paths.add(path);

    const file = path.slice(path.lastIndexOf('/') + 1);
    const object = file.replace(/\.[^.]+$/, '').toLowerCase();
    const list = byObject.get(object);
    if (list) list.push(path);
    else byObject.set(object, [path]);
  }

  return { paths, byObject, builtAt: Date.now() };
}

async function index(module: string): Promise<Index | null> {
  const repo = repoForModule(module);
  if (!repo.root) return null;

  const cached = cache.get(repo.id);
  if (cached && Date.now() - cached.builtAt < TTL_MS) return cached;
  try {
    const built = await build(repo);
    cache.set(repo.id, built);
    return built;
  } catch {
    // sem repositório acessível o índice simplesmente não existe: as duas
    // defesas viram no-op, e a esteira segue como antes
    return null;
  }
}

/** Caminhos reais de um objeto pelo nome (`w_lea_aih` -> ws_objects/...). */
export async function resolveObjectPaths(
  module: string,
  names: string[],
): Promise<Map<string, string[]>> {
  const idx = await index(module);
  const found = new Map<string, string[]>();
  if (!idx) return found;

  for (const raw of names) {
    // a IA às vezes escreve "w_aih (Emissão de AIH)" ou "d_agm09tab.srd"
    const name = raw
      .toLowerCase()
      .replace(/\.[a-z]{3}$/, '')
      .replace(/\s*\(.*\)\s*/, '')
      .trim();
    const paths = idx.byObject.get(name);
    if (paths?.length) found.set(raw, paths.slice(0, 5));
  }

  return found;
}

/**
 * Caminhos citados no diff que NÃO existem no repositório. Lista vazia quando o
 * índice não está disponível — nunca inventa acusação por falta de dado.
 */
export async function unknownDiffPaths(module: string, paths: string[]): Promise<string[]> {
  const idx = await index(module);
  if (!idx) return [];
  return paths.filter((p) => !idx.paths.has(p));
}

/** Busca por trecho do nome — usada quando o objeto citado não bate exatamente. */
export async function searchObjects(
  module: string,
  fragment: string,
  limit = 8,
): Promise<string[]> {
  const idx = await index(module);
  if (!idx) return [];

  const needle = fragment.toLowerCase();
  const hits: string[] = [];
  for (const [object, paths] of idx.byObject) {
    if (object.includes(needle)) {
      hits.push(...paths);
      if (hits.length >= limit) break;
    }
  }
  return hits.slice(0, limit);
}
