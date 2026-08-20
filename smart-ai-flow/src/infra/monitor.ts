import { prisma } from './db';
import { getSettings, type PlatformSettings } from './settingsRepository';

/**
 * Checagem de saúde de tudo que a esteira depende — Postgres, os dois
 * microserviços (app_trace, pb-insight), Jira e as chaves de IA. Alimenta
 * a aba "Monitor de Recursos" nas Configurações.
 */
export interface ResourceStatus {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
  latencyMs?: number;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 4000,
): Promise<{ resp?: Response; latencyMs: number; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return { resp, latencyMs: Date.now() - start };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkPostgres(): Promise<ResourceStatus> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { id: 'postgres', label: 'Postgres', ok: true, detail: 'conectado', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      id: 'postgres',
      label: 'Postgres',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

async function checkAppTrace(traceServiceUrl: string): Promise<ResourceStatus> {
  const { resp, latencyMs, error } = await fetchWithTimeout(`${traceServiceUrl}/health`);
  if (error) return { id: 'app_trace', label: 'app_trace', ok: false, detail: error, latencyMs };
  if (!resp!.ok) return { id: 'app_trace', label: 'app_trace', ok: false, detail: `HTTP ${resp!.status}`, latencyMs };
  const data = (await resp!.json().catch(() => ({}))) as { version?: string };
  return {
    id: 'app_trace',
    label: 'app_trace',
    ok: true,
    detail: data.version ? `versão ${data.version}` : 'no ar',
    latencyMs,
  };
}

async function checkPbInsight(pbInsightUrl: string): Promise<ResourceStatus> {
  const { resp, latencyMs, error } = await fetchWithTimeout(`${pbInsightUrl}/health`);
  if (error) return { id: 'pb_insight', label: 'PB Insight', ok: false, detail: error, latencyMs };
  if (!resp!.ok) return { id: 'pb_insight', label: 'PB Insight', ok: false, detail: `HTTP ${resp!.status}`, latencyMs };
  const data = (await resp!.json().catch(() => ({}))) as {
    version?: { objectCount?: number; ingestedAt?: string };
  };

  // Serviço no ar sem grafo indexado: `ingestedAt` volta na época zero, e ler
  // isso como data daria "indexado há 20685d". O que o dev precisa saber aqui
  // é que falta rodar o ingest — a análise sai sem grounding até lá.
  if (!data.version?.objectCount) {
    return {
      id: 'pb_insight',
      label: 'PB Insight',
      ok: true,
      detail: 'no ar, sem índice — rode o ingest (ver README)',
      latencyMs,
    };
  }

  const parts: string[] = [`${data.version.objectCount.toLocaleString('pt-BR')} objetos`];
  // Idade do índice importa: analisar contra um grafo de semanas atrás significa
  // apontar código que já mudou. `npm run ingest` no pb-insight reindexa.
  let stale = false;
  if (data.version?.ingestedAt) {
    const days = Math.floor((Date.now() - new Date(data.version.ingestedAt).getTime()) / 86_400_000);
    stale = days >= 7;
    parts.push(days === 0 ? 'indexado hoje' : `indexado há ${days}d`);
  }

  return {
    id: 'pb_insight',
    label: 'PB Insight',
    ok: true,
    detail: (parts.join(' · ') || 'no ar') + (stale ? ' — considere reindexar' : ''),
    latencyMs,
  };
}

/**
 * Alcançabilidade do Jira, não autenticação: as credenciais agora são por
 * usuário, então o monitor global só consegue afirmar que a instância responde.
 * Um 401 aqui é resultado esperado e conta como "no ar".
 */
async function checkJira(settings: PlatformSettings): Promise<ResourceStatus> {
  if (!settings.jiraBaseUrl) {
    return { id: 'jira', label: 'Jira', ok: false, detail: 'URL não configurada' };
  }
  const { resp, latencyMs, error } = await fetchWithTimeout(
    `${settings.jiraBaseUrl}/rest/api/2/serverInfo`,
    { headers: { Accept: 'application/json' } },
  );
  if (error) return { id: 'jira', label: 'Jira', ok: false, detail: error, latencyMs };

  const reachable = resp!.ok || resp!.status === 401 || resp!.status === 403;
  if (!reachable) {
    return { id: 'jira', label: 'Jira', ok: false, detail: `HTTP ${resp!.status}`, latencyMs };
  }

  const info = (await resp!.json().catch(() => ({}))) as { version?: string };
  return {
    id: 'jira',
    label: 'Jira',
    ok: true,
    detail: info.version ? `instância no ar (v${info.version})` : 'instância no ar',
    latencyMs,
  };
}

export async function checkResources(): Promise<ResourceStatus[]> {
  const settings = await getSettings();

  const [postgres, appTrace, pbInsight, jira] = await Promise.all([
    checkPostgres(),
    checkAppTrace(settings.traceServiceUrl),
    checkPbInsight(settings.pbInsightUrl),
    checkJira(settings),
  ]);

  // Sem endpoint de health gratuito nas APIs de LLM — reporta "configurado",
  // não "no ar" (checar de verdade custaria tokens a cada refresh do monitor).
  //
  // Só o provider ativo conta como falha: ter apenas uma das duas chaves é o
  // caso normal, e pintar a outra de vermelho seria alarme falso.
  const anthropicActive = settings.aiProvider === 'anthropic';
  const openaiActive = settings.aiProvider === 'openai';

  const describeLlm = (hasKey: boolean, active: boolean, model: string) => {
    if (!hasKey) return active ? 'ATIVO, mas sem chave — a análise vai falhar' : 'sem chave (inativo)';
    return active ? `ATIVO · modelo ${model}` : `configurado, inativo · modelo ${model}`;
  };

  const anthropic: ResourceStatus = {
    id: 'anthropic',
    label: 'Anthropic API',
    ok: anthropicActive ? !!settings.anthropicApiKey : true,
    detail: describeLlm(!!settings.anthropicApiKey, anthropicActive, settings.model),
  };
  const openai: ResourceStatus = {
    id: 'openai',
    label: 'OpenAI API',
    ok: openaiActive ? !!settings.openaiApiKey : true,
    detail: describeLlm(!!settings.openaiApiKey, openaiActive, settings.openaiModel),
  };

  return [postgres, appTrace, pbInsight, jira, anthropic, openai];
}
