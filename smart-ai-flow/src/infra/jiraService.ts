import type { CardImage, CardTraceFile } from '../domain/card';
import { getSettings } from './settingsRepository';
import { getJiraCredentials, type JiraCredentials } from './userRepository';

/**
 * Cliente do Jira Server/Data Center (REST API v2 — v3/ADF é só Cloud).
 * Essa instância (v8.0.2) é anterior a Personal Access Tokens (chegaram na 8.14),
 * então a autenticação é Basic Auth com usuário + senha reais.
 *
 * As credenciais são POR USUÁRIO (guardadas cifradas em User.jiraPasswordEnc):
 * `assignee = currentUser()` só faz sentido se cada dev autenticar com a conta
 * dele — com uma conta única no sistema, todo mundo veria os chamados da mesma
 * pessoa. A URL base segue global (é a mesma instância pra todos).
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

function authHeader(creds: JiraCredentials): string {
  return 'Basic ' + Buffer.from(`${creds.user}:${creds.password}`).toString('base64');
}

export async function jiraFetch(url: string, creds: JiraCredentials): Promise<Response> {
  const resp = await fetch(url, {
    headers: { Authorization: authHeader(creds), Accept: 'application/json' },
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

/** Resolve a URL base + credenciais do usuário, com erros que dizem o que fazer. */
async function jiraContext(userId: string): Promise<{ baseUrl: string; creds: JiraCredentials }> {
  const [settings, creds] = await Promise.all([getSettings(), getJiraCredentials(userId)]);
  if (!settings.jiraBaseUrl) {
    throw new Error('URL do Jira não configurada — veja Configurações > Jira.');
  }
  if (!creds) {
    throw new Error('Suas credenciais do Jira não estão configuradas — veja Configurações > Conta.');
  }
  return { baseUrl: settings.jiraBaseUrl, creds };
}

async function downloadAttachment(url: string, creds: JiraCredentials): Promise<Buffer> {
  const resp = await jiraFetch(url, creds);
  if (!resp.ok) {
    throw new Error(`falha ao baixar anexo do Jira (status ${resp.status})`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

export async function fetchJiraIssue(userId: string, key: string): Promise<JiraIssuePreview> {
  const { baseUrl, creds } = await jiraContext(userId);

  const resp = await jiraFetch(`${baseUrl}/rest/api/2/issue/${encodeURIComponent(key)}`, creds);

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
      const buf = await downloadAttachment(att.content, creds);
      images.push({ name: att.filename, mediaType: att.mimeType, data: buf.toString('base64') });
    } else if (
      (att.mimeType.startsWith('text/') || /\.(log|txt|trc)$/i.test(att.filename)) &&
      att.size <= MAX_TRACE_BYTES &&
      traceFiles.length < MAX_TRACE_FILES
    ) {
      const buf = await downloadAttachment(att.content, creds);
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

/** Chamados abertos atribuídos AO USUÁRIO autenticado — só avisa, nunca cria card. */
export async function searchAssignedIssues(userId: string): Promise<AssignedIssue[]> {
  const [{ baseUrl, creds }, settings] = await Promise.all([jiraContext(userId), getSettings()]);

  const url = `${baseUrl}/rest/api/2/search?jql=${encodeURIComponent(settings.jiraAssignedJql)}&fields=summary&maxResults=20`;
  const resp = await jiraFetch(url, creds);

  if (!resp.ok) {
    throw new Error(`Jira respondeu ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as JiraSearchResponse;
  return data.issues.map((i) => ({ key: i.key, summary: i.fields.summary }));
}
