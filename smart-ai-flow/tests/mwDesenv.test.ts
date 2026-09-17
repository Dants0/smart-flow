import { describe, expect, it } from 'vitest';
import {
  avaliarCredencialMw,
  camposFaltandoMw20,
  consultaUsr,
  portaPadraoMw20,
  usuarioMwAtivo,
  type UsrRow,
} from '../src/domain/mwDesenv';

const usr = (patch: Partial<UsrRow> = {}): UsrRow => ({
  usr_login: 'GUILHERME',
  usr_senha: 'segredo',
  usr_status: 'A',
  usr_nome: 'Guilherme Dantas',
  ...patch,
});

describe('usuarioMwAtivo', () => {
  it("'A' e nulo são ativos, como no SMART", () => {
    expect(usuarioMwAtivo('A')).toBe(true);
    expect(usuarioMwAtivo(null)).toBe(true);
    expect(usuarioMwAtivo(' a ')).toBe(true);
  });

  it("'I' é inativo", () => {
    expect(usuarioMwAtivo('I')).toBe(false);
  });
});

describe('avaliarCredencialMw', () => {
  it('login e senha batendo com usuário ativo libera', () => {
    expect(avaliarCredencialMw(usr(), 'segredo')).toEqual({
      ok: true,
      login: 'GUILHERME',
      nome: 'Guilherme Dantas',
    });
  });

  it('usuário que não existe', () => {
    expect(avaliarCredencialMw(null, 'x')).toMatchObject({ ok: false, motivo: 'NAO_ENCONTRADO' });
  });

  it('senha errada', () => {
    expect(avaliarCredencialMw(usr(), 'outra')).toMatchObject({ ok: false, motivo: 'SENHA' });
  });

  it('senha compara com caixa — é texto aberto, valor exato', () => {
    expect(avaliarCredencialMw(usr(), 'SEGREDO')).toMatchObject({ ok: false, motivo: 'SENHA' });
  });

  it('espaço de coluna CHAR não é diferença de senha', () => {
    expect(avaliarCredencialMw(usr({ usr_senha: 'segredo   ', usr_login: 'GUILHERME  ' }), 'segredo')).toEqual({
      ok: true,
      login: 'GUILHERME',
      nome: 'Guilherme Dantas',
    });
  });

  it('inativo é dito antes de acusar a senha', () => {
    expect(avaliarCredencialMw(usr({ usr_status: 'I' }), 'errada')).toMatchObject({
      ok: false,
      motivo: 'INATIVO',
    });
  });

  it('senha nula no banco não aceita senha vazia disfarçada', () => {
    expect(avaliarCredencialMw(usr({ usr_senha: null }), 'x')).toMatchObject({ ok: false, motivo: 'SENHA' });
  });
});

describe('consultaUsr', () => {
  it('usa parâmetro nomeado, nunca o login concatenado', () => {
    expect(consultaUsr('sqlserver')).toContain('@login');
    expect(consultaUsr('oracle')).toContain(':login');
    expect(consultaUsr('oracle')).toContain('ROWNUM = 1');
    expect(consultaUsr('sqlserver')).toContain('TOP 1');
  });
});

describe('conexão do MW20', () => {
  it('aponta o que falta preencher', () => {
    expect(
      camposFaltandoMw20({ engine: 'oracle', host: 'db', port: null, database: null, user: 'ro', password: null }),
    ).toEqual(['service name', 'senha']);
    expect(
      camposFaltandoMw20({ engine: 'sqlserver', host: 'db', port: 1433, database: 'MW20', user: 'ro', password: 'x' }),
    ).toEqual([]);
  });

  it('porta padrão por banco', () => {
    expect(portaPadraoMw20('sqlserver')).toBe(1433);
    expect(portaPadraoMw20('oracle')).toBe(1521);
  });
});
