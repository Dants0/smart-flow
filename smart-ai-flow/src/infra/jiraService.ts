import type { CardImage, CardTraceFile } from '../domain/card';
import { getSettings } from './settingsRepository';
import {
  blockJiraAuth,
  getJiraAuthBlock,
  getJiraCredentials,
  type JiraCredentials,
} from './userRepository';

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

export type JiraDenialCode = 'CAPTCHA' | 'UNAUTHORIZED';

/**
 * Autenticação negada pelo Jira — categoria diferente de "Jira fora do ar".
 * A distinção importa: indisponibilidade passa sozinha e vale continuar
 * tentando; negação NÃO passa sozinha, e insistir piora (cada tentativa conta
 * como login falhado e rearma o CAPTCHA do Jira Server).
 */
export class JiraAuthError extends Error {
  constructor(
    readonly code: JiraDenialCode,
    message: string,
  ) {
    super(message);
    this.name = 'JiraAuthError';
  }
}

const DENIAL_MESSAGE: Record<JiraDenialCode, string> = {
  CAPTCHA:
    'O Jira exigiu CAPTCHA para esta conta e parou de aceitar a API. Destrave assim: feche o board, saia do Jira no navegador, entre de novo pela tela de login resolvendo o CAPTCHA e regrave sua senha em Configurações > Minha conta.',
  UNAUTHORIZED:
    'O Jira recusou seu usuário e senha (401). Regrave a senha em Configurações > Minha conta — enquanto isso o backend não vai tentar de novo, pra não travar sua conta no Jira.',
};

/**
 * Classifica a resposta do Jira. Pura de propósito: é a regra que decide entre
 * "para de tentar" e "tenta de novo depois", e precisa ser testável sem rede.
 *
 * O header é o sinal confiável: o Jira Server responde CAPTCHA com 401 e, em
 * algumas rotas, até com 200 — checar só o status deixaria passar.
 */
export function classifyDenial(
  status: number,
  deniedReasonHeader: string | null,
): JiraDenialCode | null {
  if (deniedReasonHeader?.toUpperCase().includes('CAPTCHA')) return 'CAPTCHA';
  if (status === 401) return 'UNAUTHORIZED';
  return null;
}

function authHeader(creds: JiraCredentials): string {
  return 'Basic ' + Buffer.from(`${creds.user}:${creds.password}`).toString('base64');
}

/**
 * Toda chamada ao Jira passa por aqui. Negação de autenticação vira bloqueio
 * persistido: o backend deixa de tentar até o dev regravar a senha ou pedir
 * pra tentar de novo. Sem isso, o polling do board (a cada 60s, por aba
 * aberta) rearma o CAPTCHA do Jira Server minutos depois de o dev destravar.
 */
export async function jiraFetch(
  url: string,
  creds: JiraCredentials,
  userId: string,
): Promise<Response> {
  const resp = await fetch(url, {
    headers: { Authorization: authHeader(creds), Accept: 'application/json' },
  });

  const denial = classifyDenial(resp.status, resp.headers.get('x-authentication-denied-reason'));
  if (denial) {
    const message = DENIAL_MESSAGE[denial];
    await blockJiraAuth(userId, message);
    throw new JiraAuthError(denial, message);
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

  // Bloqueado: nem chega a abrir conexão. Cada tentativa a mais é um login
  // falhado a mais na conta do dev no Jira.
  const blocked = await getJiraAuthBlock(userId);
  if (blocked) throw new JiraAuthError('CAPTCHA', blocked.reason);

  return { baseUrl: settings.jiraBaseUrl, creds };
}

async function downloadAttachment(
  url: string,
  creds: JiraCredentials,
  userId: string,
): Promise<Buffer> {
  const resp = await jiraFetch(url, creds, userId);
  if (!resp.ok) {
    throw new Error(`falha ao baixar anexo do Jira (status ${resp.status})`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

export async function fetchJiraIssue(userId: string, key: string): Promise<JiraIssuePreview> {
  const { baseUrl, creds } = await jiraContext(userId);

  const resp = await jiraFetch(`${baseUrl}/rest/api/2/issue/${encodeURIComponent(key)}`, creds, userId);

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
      const buf = await downloadAttachment(att.content, creds, userId);
      images.push({ name: att.filename, mediaType: att.mimeType, data: buf.toString('base64') });
    } else if (
      (att.mimeType.startsWith('text/') || /\.(log|txt|trc)$/i.test(att.filename)) &&
      att.size <= MAX_TRACE_BYTES &&
      traceFiles.length < MAX_TRACE_FILES
    ) {
      const buf = await downloadAttachment(att.content, creds, userId);
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
  const resp = await jiraFetch(url, creds, userId);

  if (!resp.ok) {
    throw new Error(`Jira respondeu ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as JiraSearchResponse;
  return data.issues.map((i) => ({ key: i.key, summary: i.fields.summary }));
}

/**
 * Resultado do "Testar conexão" da tela de conta. Separa deliberadamente as duas
 * perguntas que o dev tem: **entrei?** (autenticação) e **vou ver meus
 * chamados?** (a JQL). Uma pode falhar sem a outra: credencial certa com JQL
 * quebrada autentica e não traz nada — antes isso aparecia como "o Jira não
 * responde", que manda o dev caçar o problema no lugar errado.
 */
export interface JiraConnectionTest {
  username: string;
  displayName: string;
  /** Quantos chamados a JQL configurada devolve. null = a consulta falhou. */
  assignedCount: number | null;
  jqlError?: string;
  latencyMs: number;
}

export async function testJiraConnection(userId: string): Promise<JiraConnectionTest> {
  const [{ baseUrl, creds }, settings] = await Promise.all([jiraContext(userId), getSettings()]);
  const started = Date.now();

  // /myself é a checagem mais barata que existe: confirma a credencial e ainda
  // diz PARA QUEM ela resolve — é o que pega o caso de logar com a conta errada.
  const resp = await jiraFetch(`${baseUrl}/rest/api/2/myself`, creds, userId);
  if (!resp.ok) {
    throw new Error(`Jira respondeu ${resp.status} ao identificar seu usuário`);
  }
  const me = (await resp.json()) as { name?: string; displayName?: string };
  const latencyMs = Date.now() - started;

  // maxResults=0 traz só o total: valida a JQL sem baixar chamado nenhum.
  let assignedCount: number | null = null;
  let jqlError: string | undefined;
  try {
    const searchUrl = `${baseUrl}/rest/api/2/search?jql=${encodeURIComponent(settings.jiraAssignedJql)}&maxResults=0`;
    const search = await jiraFetch(searchUrl, creds, userId);
    if (search.ok) {
      assignedCount = ((await search.json()) as { total?: number }).total ?? 0;
    } else {
      jqlError = `a consulta JQL falhou (HTTP ${search.status}) — veja Configurações > Jira`;
    }
  } catch (err) {
    // autenticação já passou; problema na busca não invalida o teste
    jqlError = err instanceof Error ? err.message : 'falha ao rodar a consulta JQL';
  }

  return {
    username: me.name ?? creds.user,
    displayName: me.displayName ?? creds.user,
    assignedCount,
    jqlError,
    latencyMs,
  };
}
