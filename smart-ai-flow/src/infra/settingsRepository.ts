import type { PlatformSettings as PlatformSettingsRow } from '@prisma/client';
import { prisma } from './db';
import { decryptSecret, encryptSecret } from './crypto';
import type { Mw20Conexao, MwEngine } from '../domain/mwDesenv';

/**
 * Configuração da plataforma — linha única no banco (id=1), substitui o .env
 * pra tudo que não é bootstrap. Lida a cada chamada (nunca cacheada em módulo)
 * pra uma troca na tela de Configurações valer na hora, sem reiniciar o backend.
 */
/**
 * Como autenticar na Anthropic. Não é preferência: a conta corporativa emite
 * token OAuth (`CLAUDE_CODE_OAUTH_TOKEN`) e não emite chave de API, e os dois
 * viajam em headers diferentes — mandar um no lugar do outro dá 401.
 */
export type AnthropicAuthType = 'apiKey' | 'oauth';

export interface PlatformSettings {
  /** Credencial da Anthropic em uso — chave de API OU token OAuth, nunca as duas. */
  anthropicCredential: string | null;
  anthropicAuthType: AnthropicAuthType;
  model: string;

  aiProvider: string;
  openaiApiKey: string | null;
  openaiModel: string;

  traceServiceUrl: string;

  /** Nunca vazio: sem valor gravado, vale `DEFAULT_JIRA_BASE_URL`. */
  jiraBaseUrl: string;
  jiraAssignedJql: string;

  pbInsightUrl: string;

  /** Skill do time (texto livre) injetada no prompt dos agentes. null = nenhuma. */
  skills: string | null;

  /** Conexão ao banco MW20 (tabela `usr`), com a senha já decifrada. */
  mw20: Mw20Conexao;

  updatedAt: string;
}

/**
 * Endereço dos microserviços. Vem do ambiente porque é topologia de deploy, não
 * preferência de usuário: no Docker o compose passa o nome do serviço
 * (`http://trace-api:8070`), e fora dele o fallback de loopback continua
 * valendo pra quem sobe o backend com `npm run dev`.
 */
const TRACE_SERVICE_URL = process.env.TRACE_SERVICE_URL || 'http://localhost:8070';
const PB_INSIGHT_URL = process.env.PB_INSIGHT_URL || 'http://127.0.0.1:4500';

/** Exportado porque a tela de Configurações oferece "restaurar padrão". */
export const DEFAULT_ASSIGNED_JQL =
  'assignee = currentUser() AND status not in (19653, 17600, 20403, 13141, 19738, 19774, 13145, 24901, 19772, 13144) ORDER BY created DESC';

const DEFAULTS = {
  model: 'claude-sonnet-5',
  anthropicAuthType: 'apiKey',
  aiProvider: 'anthropic',
  openaiModel: 'gpt-4o',
  traceServiceUrl: TRACE_SERVICE_URL,
  jiraAssignedJql: DEFAULT_ASSIGNED_JQL,
  pbInsightUrl: PB_INSIGHT_URL,
};

/**
 * A instância do Jira da Pixeon. Com o login pela conta do Jira, a URL base
 * deixou de ser opcional: sem ela ninguém entra na plataforma, nem o admin que
 * iria configurá-la. `JIRA_BASE_URL` no ambiente sobrescreve (homologação).
 */
export const DEFAULT_JIRA_BASE_URL =
  normalizeBaseUrl(process.env.JIRA_BASE_URL ?? null) ?? 'https://portalcliente.pixeon.com';

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

/**
 * Tira a barra do fim da URL base. Quem monta caminho concatena `/rest/api/...`,
 * então uma barra sobrando vira `//rest` — e o Jira Server responde a isso com
 * `null for uri: .../com//rest/api/2/search`: um 404 que, lido de longe, parece
 * consulta recusada.
 *
 * Roda também na LEITURA, de propósito: a linha já gravada com barra volta a
 * funcionar na hora, sem depender de alguém abrir a tela e salvar de novo.
 */
export function normalizeBaseUrl(url: string | null): string | null {
  if (url === null) return null;
  const limpo = url.trim().replace(/\/+$/, '');
  return limpo === '' ? null : limpo;
}

/**
 * Conserta a linha gravada antes de o backend passar a rodar em container: um
 * loopback salvo no banco aponta pro próprio container do backend e nunca
 * alcança o microserviço — é o que fazia app_trace e PB Insight aparecerem
 * OFFLINE no monitor com os dois no ar.
 *
 * Só reescreve o que ainda é loopback, e só quando o ambiente diz qual é o
 * endereço certo: uma URL apontada pra outra máquina na tela de Configurações
 * é escolha deliberada e fica intacta.
 */
async function repairLoopbackUrls(row: PlatformSettingsRow): Promise<PlatformSettingsRow> {
  const data: Record<string, string> = {};
  if (process.env.TRACE_SERVICE_URL && LOOPBACK.test(row.traceServiceUrl)) {
    data.traceServiceUrl = TRACE_SERVICE_URL;
  }
  if (process.env.PB_INSIGHT_URL && LOOPBACK.test(row.pbInsightUrl)) {
    data.pbInsightUrl = PB_INSIGHT_URL;
  }
  if (Object.keys(data).length === 0) return row;
  return prisma.platformSettings.update({ where: { id: 1 }, data });
}

/** Cria a linha única (id=1) na primeira leitura, se ainda não existir. */
async function ensureRow() {
  const row = await prisma.platformSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...DEFAULTS },
  });
  return repairLoopbackUrls(row);
}

export async function getSettings(): Promise<PlatformSettings> {
  return toSettings(await ensureRow());
}

export type PlatformSettingsPatch = Partial<
  Omit<PlatformSettings, 'updatedAt' | 'mw20' | 'jiraBaseUrl'> & {
    jiraBaseUrl: string;
    mw20Engine: MwEngine | '';
    mw20Host: string;
    /** null apaga (volta pra porta padrão do banco). */
    mw20Port: number | null;
    mw20Database: string;
    mw20User: string;
    /** Vazio mantém a senha gravada — igual às outras credenciais da tela. */
    mw20Password: string;
  }
>;

/** Atualiza só os campos enviados. String vazia é tratada como "sem valor" (não apaga sem querer). */
export async function updateSettings(patch: PlatformSettingsPatch): Promise<PlatformSettings> {
  const atual = await ensureRow();

  const data: Record<string, string | number | null> = {};
  const { mw20Password, mw20Port, ...resto } = patch;
  if (mw20Password) data.mw20PasswordEnc = encryptSecret(mw20Password);
  if (mw20Port !== undefined) data.mw20Port = mw20Port;
  for (const [key, value] of Object.entries(resto)) {
    if (value === undefined || typeof value !== 'string') continue;
    data[key] = key === 'jiraBaseUrl' ? normalizeBaseUrl(value) : value === '' ? null : value;
  }

  // Trocar o tipo de credencial apaga a que estava guardada. Uma chave de API
  // mandada como Bearer (ou o contrário) só produz 401 — manter o segredo velho
  // no banco seria guardar algo que não serve pra nada e ainda vaza se alguém
  // voltar o tipo sem querer. Quem manda a nova credencial no mesmo patch não é
  // afetado: o valor enviado vence.
  if (
    typeof data.anthropicAuthType === 'string' &&
    data.anthropicAuthType !== atual.anthropicAuthType &&
    data.anthropicCredential === undefined
  ) {
    data.anthropicCredential = null;
  }

  const row = await prisma.platformSettings.update({ where: { id: 1 }, data });
  return toSettings(row);
}

function toSettings(row: Awaited<ReturnType<typeof ensureRow>>): PlatformSettings {
  return {
    anthropicCredential: row.anthropicCredential,
    anthropicAuthType: row.anthropicAuthType as AnthropicAuthType,
    model: row.model,
    aiProvider: row.aiProvider,
    openaiApiKey: row.openaiApiKey,
    openaiModel: row.openaiModel,
    traceServiceUrl: row.traceServiceUrl,
    jiraBaseUrl: normalizeBaseUrl(row.jiraBaseUrl) ?? DEFAULT_JIRA_BASE_URL,
    jiraAssignedJql: row.jiraAssignedJql,
    pbInsightUrl: row.pbInsightUrl,
    skills: row.skills,
    mw20: {
      engine: (row.mw20Engine as MwEngine | null) ?? null,
      host: row.mw20Host,
      port: row.mw20Port,
      database: row.mw20Database,
      user: row.mw20User,
      password: row.mw20PasswordEnc ? decryptSecret(row.mw20PasswordEnc) : null,
    },
    updatedAt: row.updatedAt.toISOString(),
  };
}
