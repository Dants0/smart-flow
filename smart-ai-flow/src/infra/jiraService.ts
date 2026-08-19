import type { CardImage, CardTraceFile } from '../domain/card';

/**
 * Cliente do Jira Server/Data Center (REST API v2 — v3/ADF é só Cloud).
 * Essa instância (v8.0.2) é anterior a Personal Access Tokens (chegaram na 8.14),
 * então a autenticação é Basic Auth com usuário + senha reais — por isso a
 * credencial vive só no .env do backend, nunca no navegador.
 */
const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_USER = process.env.JIRA_USER;
const JIRA_PASSWORD = process.env.JIRA_PASSWORD;
const JIRA_ASSIGNED_JQL =
  process.env.JIRA_ASSIGNED_JQL ??
  'assignee = currentUser() AND resolution = Unresolved ORDER BY created DESC';

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

function authHeader(): string {
  if (!JIRA_USER || !JIRA_PASSWORD) {
    throw new Error('JIRA_USER / JIRA_PASSWORD não configurados no .env do backend');
  }
  return 'Basic ' + Buffer.from(`${JIRA_USER}:${JIRA_PASSWORD}`).toString('base64');
}

async function jiraFetch(url: string): Promise<Response> {
  const resp = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
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

async function downloadAttachment(url: string): Promise<Buffer> {
  const resp = await jiraFetch(url);
  if (!resp.ok) {
    throw new Error(`falha ao baixar anexo do Jira (status ${resp.status})`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

export async function fetchJiraIssue(key: string): Promise<JiraIssuePreview> {
  if (!JIRA_BASE_URL) {
    throw new Error('JIRA_BASE_URL não configurado no .env do backend');
  }

  const resp = await jiraFetch(`${JIRA_BASE_URL}/rest/api/2/issue/${encodeURIComponent(key)}`);

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
      const buf = await downloadAttachment(att.content);
      images.push({ name: att.filename, mediaType: att.mimeType, data: buf.toString('base64') });
    } else if (
      (att.mimeType.startsWith('text/') || /\.(log|txt|trc)$/i.test(att.filename)) &&
      att.size <= MAX_TRACE_BYTES &&
      traceFiles.length < MAX_TRACE_FILES
    ) {
      const buf = await downloadAttachment(att.content);
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
  if (!JIRA_BASE_URL) {
    throw new Error('JIRA_BASE_URL não configurado no .env do backend');
  }

  const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(JIRA_ASSIGNED_JQL)}&fields=summary&maxResults=20`;
  const resp = await jiraFetch(url);

  if (!resp.ok) {
    throw new Error(`Jira respondeu ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as JiraSearchResponse;
  return data.issues.map((i) => ({ key: i.key, summary: i.fields.summary }));
}
