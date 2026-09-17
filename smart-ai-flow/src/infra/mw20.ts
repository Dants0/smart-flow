import sql from 'mssql';
import oracledb from 'oracledb';
import {
  avaliarCredencialMw,
  camposFaltandoMw20,
  consultaUsr,
  portaPadraoMw20,
  type Mw20Conexao,
  type MwEngine,
  type MwVeredito,
  type UsrRow,
} from '../domain/mwDesenv';
import { getSettings } from './settingsRepository';
import { getMwCredentials, recordMwValidation, type AuthUser } from './userRepository';

/**
 * Leitura da tabela `usr` do banco MW20 — só SELECT, conexão aberta e fechada
 * por consulta. A validação é rara (quando o dev salva a credencial ou clica em
 * testar), então pool permanente seria conexão parada num banco de outro time.
 *
 * Os dois drivers são JavaScript puro (`mssql` via tedious, `oracledb` em modo
 * thin): nada de Oracle Instant Client na imagem do backend.
 */

const TIMEOUT_MS = 10000;

/**
 * Falha de conexão ou de configuração — categoria diferente de "credencial
 * recusada". Não pode invalidar a credencial do dev: o banco fora do ar não diz
 * nada sobre a senha dele.
 */
export class Mw20IndisponivelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Mw20IndisponivelError';
  }
}

type ConexaoCompleta = { [K in keyof Mw20Conexao]: NonNullable<Mw20Conexao[K]> };

function conexaoCompleta(c: Mw20Conexao): ConexaoCompleta {
  const faltando = camposFaltandoMw20(c);
  if (faltando.length > 0) {
    throw new Mw20IndisponivelError(
      `a conexão com o banco MW20 não está configurada (falta: ${faltando.join(', ')}) — peça a um admin em Configurações > MW desenv`,
    );
  }
  const engine = c.engine as MwEngine;
  return { ...(c as ConexaoCompleta), port: c.port ?? portaPadraoMw20(engine) };
}

async function consultarSqlServer(c: ConexaoCompleta, login: string): Promise<UsrRow | null> {
  const pool = new sql.ConnectionPool({
    server: c.host,
    port: c.port,
    database: c.database,
    user: c.user,
    password: c.password,
    connectionTimeout: TIMEOUT_MS,
    requestTimeout: TIMEOUT_MS,
    // Banco interno com certificado próprio: sem isto o tedious recusa a conexão.
    options: { encrypt: false, trustServerCertificate: true },
  });
  try {
    await pool.connect();
    const result = await pool.request().input('login', sql.VarChar, login).query<UsrRow>(consultaUsr('sqlserver'));
    return result.recordset[0] ?? null;
  } finally {
    await pool.close().catch(() => undefined);
  }
}

async function consultarOracle(c: ConexaoCompleta, login: string): Promise<UsrRow | null> {
  const conn = await oracledb.getConnection({
    user: c.user,
    password: c.password,
    connectString: `${c.host}:${c.port}/${c.database}`,
    connectTimeout: TIMEOUT_MS / 1000,
  });
  try {
    const result = await conn.execute<Record<string, string | null>>(
      consultaUsr('oracle'),
      { login },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0];
    if (!row) return null;
    // Oracle devolve os nomes de coluna em maiúsculas.
    return {
      usr_login: row.USR_LOGIN ?? '',
      usr_senha: row.USR_SENHA ?? null,
      usr_status: row.USR_STATUS ?? null,
      usr_nome: row.USR_NOME ?? null,
    };
  } finally {
    await conn.close().catch(() => undefined);
  }
}

async function buscarUsr(conexao: Mw20Conexao, login: string): Promise<UsrRow | null> {
  const c = conexaoCompleta(conexao);
  try {
    return c.engine === 'oracle' ? await consultarOracle(c, login) : await consultarSqlServer(c, login);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    throw new Mw20IndisponivelError(
      `não foi possível consultar a tabela usr no MW20 (${c.host}:${c.port}) — ${motivo}`,
    );
  }
}

/**
 * Confere a credencial gravada do dev contra a `usr` e grava o veredito.
 * Banco fora do ar/sem configuração lança `Mw20IndisponivelError` e NÃO mexe
 * no estado salvo.
 */
export async function validarMwDoUsuario(
  userId: string,
): Promise<{ veredito: MwVeredito; user: AuthUser }> {
  const creds = await getMwCredentials(userId);
  if (!creds) {
    throw new Mw20IndisponivelError('preencha usuário e senha do MW desenv primeiro');
  }

  const { mw20 } = await getSettings();
  const veredito = avaliarCredencialMw(await buscarUsr(mw20, creds.user), creds.password);
  const user = await recordMwValidation(userId, veredito);
  return { veredito, user };
}

/** "Testar conexão" do admin: a conexão abre e a tabela usr responde? */
export async function testarConexaoMw20(): Promise<{ ok: true; latencyMs: number }> {
  const { mw20 } = await getSettings();
  const inicio = Date.now();
  // Login que não existe: exercita conexão, permissão de leitura na usr e a
  // consulta real, sem trazer dado de ninguém.
  await buscarUsr(mw20, '__smart_ai_flow_teste__');
  return { ok: true, latencyMs: Date.now() - inicio };
}
