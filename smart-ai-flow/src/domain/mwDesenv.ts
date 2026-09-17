/**
 * Credencial do MW desenv — regras puras, sem banco.
 *
 * O dev cadastra login e senha do MW desenv em Minha conta; a plataforma confere
 * contra a tabela `usr` do banco MW20 e só então libera, em VERSIONAMENTO, a
 * geração de versão com a identidade dele.
 *
 * As colunas e a regra de "ativo" são as do próprio SMART, conferidas no fonte
 * (`w_ident_usr_nova.srw`, `w_acs02.srw`): `usr_login`, `usr_senha`,
 * `usr_status` — ativo é `'A'` **ou nulo**, inativo é `'I'`.
 */

export type MwEngine = 'sqlserver' | 'oracle';

export const MW_ENGINES: MwEngine[] = ['sqlserver', 'oracle'];

/** Linha da `usr` que interessa pra validação. */
export interface UsrRow {
  usr_login: string;
  usr_senha: string | null;
  usr_status: string | null;
  usr_nome: string | null;
}

export type MwRecusa = 'NAO_ENCONTRADO' | 'INATIVO' | 'SENHA';

export type MwVeredito =
  | { ok: true; login: string; nome: string }
  | { ok: false; motivo: MwRecusa; mensagem: string };

/** Mesma regra do SMART: `'A'` ou sem status é ativo. */
export function usuarioMwAtivo(status: string | null): boolean {
  const s = (status ?? '').trim().toUpperCase();
  return s === '' || s === 'A';
}

/**
 * Decide se a credencial digitada vale. A senha no MW desenv é texto aberto, e a
 * comparação é exata — só o espaço à direita cai, porque coluna `CHAR` devolve o
 * valor completado com espaços e isso não é diferença de senha.
 *
 * A ordem das checagens importa para a mensagem: dizer "senha incorreta" para um
 * usuário inativo manda o dev redigitar a senha à toa.
 */
export function avaliarCredencialMw(row: UsrRow | null, senhaDigitada: string): MwVeredito {
  if (!row) {
    return {
      ok: false,
      motivo: 'NAO_ENCONTRADO',
      mensagem: 'esse login não existe na tabela usr do MW desenv — confira o usuário',
    };
  }
  if (!usuarioMwAtivo(row.usr_status)) {
    return {
      ok: false,
      motivo: 'INATIVO',
      mensagem: `o usuário ${row.usr_login.trim()} está inativo no MW desenv (usr_status = '${(row.usr_status ?? '').trim()}')`,
    };
  }
  if ((row.usr_senha ?? '').trimEnd() !== senhaDigitada.trimEnd()) {
    return { ok: false, motivo: 'SENHA', mensagem: 'senha do MW desenv incorreta' };
  }
  const login = row.usr_login.trim();
  return { ok: true, login, nome: row.usr_nome?.trim() || login };
}

/**
 * A consulta, por banco. Parâmetro nomeado sempre — login digitado nunca entra
 * concatenado no SQL. `UPPER` dos dois lados porque Oracle compara com caixa e
 * o SQL Server da base costuma não comparar: sem isso o mesmo login valeria num
 * cliente e não no outro.
 */
export function consultaUsr(engine: MwEngine): string {
  const colunas = 'usr_login, usr_senha, usr_status, usr_nome';
  return engine === 'oracle'
    ? `SELECT ${colunas} FROM usr WHERE UPPER(usr_login) = UPPER(:login) AND ROWNUM = 1`
    : `SELECT TOP 1 ${colunas} FROM usr WHERE UPPER(usr_login) = UPPER(@login)`;
}

export interface Mw20Conexao {
  engine: MwEngine | null;
  host: string | null;
  port: number | null;
  database: string | null;
  user: string | null;
  password: string | null;
}

/** O que falta na conexão do MW20, com o nome que a tela mostra. Vazio = completa. */
export function camposFaltandoMw20(c: Mw20Conexao): string[] {
  const faltando: string[] = [];
  if (!c.engine) faltando.push('banco (SQL Server/Oracle)');
  if (!c.host) faltando.push('host');
  if (!c.database) faltando.push(c.engine === 'oracle' ? 'service name' : 'nome do banco');
  if (!c.user) faltando.push('usuário');
  if (!c.password) faltando.push('senha');
  return faltando;
}

/** Porta padrão de cada banco, quando o admin deixa em branco. */
export function portaPadraoMw20(engine: MwEngine): number {
  return engine === 'oracle' ? 1521 : 1433;
}
