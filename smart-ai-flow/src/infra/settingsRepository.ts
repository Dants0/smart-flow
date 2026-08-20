import type { PlatformSettings as PlatformSettingsRow } from '@prisma/client';
import { prisma } from './db';

/**
 * Configuração da plataforma — linha única no banco (id=1), substitui o .env
 * pra tudo que não é bootstrap. Lida a cada chamada (nunca cacheada em módulo)
 * pra uma troca na tela de Configurações valer na hora, sem reiniciar o backend.
 */
export interface PlatformSettings {
  anthropicApiKey: string | null;
  model: string;

  aiProvider: string;
  openaiApiKey: string | null;
  openaiModel: string;

  traceServiceUrl: string;

  jiraBaseUrl: string | null;
  jiraAssignedJql: string;

  pbInsightUrl: string;

  /** Skill do time (texto livre) injetada no prompt dos agentes. null = nenhuma. */
  skills: string | null;

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

const DEFAULTS = {
  model: 'claude-sonnet-5',
  aiProvider: 'anthropic',
  openaiModel: 'gpt-4o',
  traceServiceUrl: TRACE_SERVICE_URL,
  jiraAssignedJql:
    'assignee = currentUser() AND resolution = Unresolved ORDER BY created DESC',
  pbInsightUrl: PB_INSIGHT_URL,
};

const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

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
  Omit<PlatformSettings, 'updatedAt'>
>;

/** Atualiza só os campos enviados. String vazia é tratada como "sem valor" (não apaga sem querer). */
export async function updateSettings(patch: PlatformSettingsPatch): Promise<PlatformSettings> {
  await ensureRow();

  const data: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    data[key] = value === '' ? null : value;
  }

  const row = await prisma.platformSettings.update({ where: { id: 1 }, data });
  return toSettings(row);
}

function toSettings(row: Awaited<ReturnType<typeof ensureRow>>): PlatformSettings {
  return {
    anthropicApiKey: row.anthropicApiKey,
    model: row.model,
    aiProvider: row.aiProvider,
    openaiApiKey: row.openaiApiKey,
    openaiModel: row.openaiModel,
    traceServiceUrl: row.traceServiceUrl,
    jiraBaseUrl: row.jiraBaseUrl,
    jiraAssignedJql: row.jiraAssignedJql,
    pbInsightUrl: row.pbInsightUrl,
    skills: row.skills,
    updatedAt: row.updatedAt.toISOString(),
  };
}
