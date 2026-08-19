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
  jiraUser: string | null;
  jiraPassword: string | null;
  jiraAssignedJql: string;

  pbInsightUrl: string;

  updatedAt: string;
}

const DEFAULTS = {
  model: 'claude-sonnet-5',
  aiProvider: 'anthropic',
  openaiModel: 'gpt-4o',
  traceServiceUrl: 'http://localhost:8070',
  jiraAssignedJql:
    'assignee = currentUser() AND resolution = Unresolved ORDER BY created DESC',
  pbInsightUrl: 'http://127.0.0.1:4500',
};

/** Cria a linha única (id=1) na primeira leitura, se ainda não existir. */
async function ensureRow() {
  return prisma.platformSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ...DEFAULTS },
  });
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
    jiraUser: row.jiraUser,
    jiraPassword: row.jiraPassword,
    jiraAssignedJql: row.jiraAssignedJql,
    pbInsightUrl: row.pbInsightUrl,
    updatedAt: row.updatedAt.toISOString(),
  };
}
