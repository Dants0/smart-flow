import type { CardImage, CardTraceFile } from '../domain/card';
import { getSettings, type PlatformSettings } from './settingsRepository';

/**
 * Cliente do Jira Server/Data Center (REST API v2 — v3/ADF é só Cloud).
 * Essa instância (v8.0.2) é anterior a Personal Access Tokens (chegaram na 8.14),
 * então a autenticação é Basic Auth com usuário + senha reais — configurados na
 * tela de Configurações (nunca no navegador).
 */
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TRACE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 6;
const MAX_TRACE_FILES = 3;

export interface JiraIssuePreview {
  rawTicket: string;
  images: CardImage[];
  traceFiles: CardTraceFile[];
}

interface JiraAttachment {
  filename: string;
  mimeType: string;
  size: number;
  content: string; // URL de download
}

interface JiraIssueResponse {
  fields: {
    summary: string;
    description: string | null;
    attachment: JiraAttachment[];
  };
}

function authHeader(settings: PlatformSettings): string {
  if (!settings.jiraUser || !settings.jiraPassword) {
    throw new Error('Usuário/senha do Jira não configurados — veja Configurações > Jira.');
  }
  return 'Basic ' + Buffer.from(`${settings.jiraUser}:${settings.jiraPassword}`).toString('base64');
}

async function jiraFetch(url: string, settings: PlatformSettings): Promise<Response> {
  const resp = await fetch(url, {
    headers: { Authorization: authHeader(settings), Accept: 'application/json' },
  });

  // Jira Server bloqueia Basic Auth com CAPTCHA depois de N logins falhos —
  // erro silencioso (às vezes 200) se não checarmos esse header.
  const captcha = resp.headers.get('x-authentication-denied-reason');
  if (captcha?.includes('CAPTCHA')) {
    throw new Error(
      'Jira exigiu CAPTCHA para esta conta — faça login uma vez pelo navegador pra destravar e tente de novo.',
    );
  }

  return resp;
}

async function downloadAttachment(url: string, settings: PlatformSettings): Promise<Buffer> {
  const resp = await jiraFetch(url, settings);
  if (!resp.ok) {
    throw new Error(`falha ao baixar anexo do Jira (status ${resp.status})`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

export async function fetchJiraIssue(key: string): Promise<JiraIssuePreview> {
  const settings = await getSettings();
  if (!settings.jiraBaseUrl) {
    throw new Error('URL do Jira não configurada — veja Configurações > Jira.');
  }

  const resp = await jiraFetch(
    `${settings.jiraBaseUrl}/rest/api/2/issue/${encodeURIComponent(key)}`,
    settings,
  );

  if (resp.status === 404) {
    throw new Error(`Chamado ${key} não encontrado no Jira`);
  }
  if (!resp.ok) {
    throw new Error(`Jira respondeu ${resp.status}: ${await resp.text()}`);
  }

  const issue = (await resp.json()) as JiraIssueResponse;
  const rawTicket = [issue.fields.summary, '', issue.fields.description ?? '']
    .join('\n')
    .trim();

  const images: CardImage[] = [];
  const traceFiles: CardTraceFile[] = [];

  for (const att of issue.fields.attachment ?? []) {
    if (
      IMAGE_MIME_TYPES.has(att.mimeType) &&
      att.size <= MAX_IMAGE_BYTES &&
      images.length < MAX_IMAGES
    ) {
      const buf = await downloadAttachment(att.content, settings);
      images.push({ name: att.filename, mediaType: att.mimeType, data: buf.toString('base64') });
    } else if (
      (att.mimeType.startsWith('text/') || /\.(log|txt|trc)$/i.test(att.filename)) &&
      att.size <= MAX_TRACE_BYTES &&
      traceFiles.length < MAX_TRACE_FILES
    ) {
      const buf = await downloadAttachment(att.content, settings);
      traceFiles.push({ name: att.filename, content: buf.toString('utf-8') });
    }
  }

  return { rawTicket, images, traceFiles };
}

export interface AssignedIssue {
  key: string;
  summary: string;
}

interface JiraSearchResponse {
  issues: { key: string; fields: { summary: string } }[];
}

/** Chamados abertos atribuídos ao usuário autenticado — pra avisar o dev, nunca cria card sozinho. */
export async function searchAssignedIssues(): Promise<AssignedIssue[]> {
  const settings = await getSettings();
  if (!settings.jiraBaseUrl) {
    throw new Error('URL do Jira não configurada — veja Configurações > Jira.');
  }

  const url = `${settings.jiraBaseUrl}/rest/api/2/search?jql=${encodeURIComponent(settings.jiraAssignedJql)}&fields=summary&maxResults=20`;
  const resp = await jiraFetch(url, settings);

  if (!resp.ok) {
    throw new Error(`Jira respondeu ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as JiraSearchResponse;
  return data.issues.map((i) => ({ key: i.key, summary: i.fields.summary }));
}
