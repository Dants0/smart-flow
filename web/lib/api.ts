import type { Card, CardImage, CardTraceFile, JiraIssuePreview, Stage } from "./types";
import { getToken, redirectToLogin, type AuthUser } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

/** Rotas públicas — não mandam token e não redirecionam em 401. */
const PUBLIC_PATHS = [
  "/auth/login",
  "/auth/status",
  "/auth/reset-password",
];

/** Erro de API que preserva o `code` — a UI decide o que mostrar por ele, não pela mensagem. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      // Só declara JSON quando existe corpo. Anunciar `application/json` numa
      // chamada sem corpo faz o Fastify responder 400 (FST_ERR_CTP_EMPTY_JSON_BODY),
      // que era o que quebrava "Testar conexão", dispensar chamado e apagar
      // usuário — todas rotas sem corpo.
      ...(init?.body === undefined ? {} : { "content-type": "application/json" }),
      ...(token && !isPublic ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  // Sessão expirada em rota protegida: volta pro login em vez de mostrar erro solto.
  if (res.status === 401 && !isPublic) {
    redirectToLogin();
    throw new Error("sessão expirada");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Erro ${res.status} em ${path}`, res.status, body.code);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

// ---- Autenticação ---------------------------------------------------------

/** Onde o login é conferido — o login da plataforma é a conta do Jira. */
export function authStatus(): Promise<{ jiraBaseUrl: string }> {
  return request("/auth/status");
}

export function login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

/**
 * Redefine a senha só com usuário + senha nova. Provisório e sem autenticação
 * nenhuma — ver o comentário da rota `/auth/reset-password` no backend antes de
 * expor esta aplicação fora da rede interna.
 */
export function resetPassword(
  username: string,
  password: string,
): Promise<{ ok: true; username: string }> {
  return request("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export interface JiraConnectionTest {
  username: string;
  displayName: string;
  /** Quantos chamados a JQL configurada devolve. null = a consulta falhou. */
  assignedCount: number | null;
  jqlError?: string;
  latencyMs: number;
}

/**
 * Testa a credencial guardada contra o Jira agora. Também libera o bloqueio
 * antes de tentar — clicar em testar é dizer "corrigi, tenta de novo".
 */
export function testJiraConnection(): Promise<JiraConnectionTest> {
  return request("/me/jira/test", { method: "POST" });
}

/** "Destravei o CAPTCHA no navegador, pode voltar a consultar o Jira." */
export function unblockJira(): Promise<AuthUser> {
  return request("/me/jira/unblock", { method: "POST" });
}

export function getMe(): Promise<AuthUser> {
  return request("/me");
}

export function updateMe(patch: {
  displayName?: string;
  password?: string;
  gitName?: string;
  gitEmail?: string;
  bitbucketUser?: string;
  bitbucketEmail?: string;
  bitbucketAppPassword?: string;
  jiraUser?: string;
  jiraPassword?: string;
  mwUser?: string;
  mwPassword?: string;
}): Promise<AuthUser> {
  return request("/me", { method: "PATCH", body: JSON.stringify(patch) });
}

export function listUsers(): Promise<AuthUser[]> {
  return request("/users");
}

export function createUser(input: {
  username: string;
  displayName: string;
  password: string;
  isAdmin?: boolean;
}): Promise<AuthUser> {
  return request("/users", { method: "POST", body: JSON.stringify(input) });
}

export function deleteUser(id: string): Promise<void> {
  return request(`/users/${id}`, { method: "DELETE" });
}

/** Versão enxuta do card, o que o board desenha. Detalhe completo em getCard(id). */
export interface CardSummary {
  id: string;
  jiraKey: string;
  module: string;
  stage: Stage;
  preview: string;
  imageCount: number;
  traceFileCount: number;
  grounded: boolean;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CardFilters {
  search?: string;
  module?: string;
  mine?: boolean;
  resolvedWithinDays?: number;
}

export function listCards(filters: CardFilters = {}): Promise<CardSummary[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.module) params.set("module", filters.module);
  if (filters.mine) params.set("mine", "true");
  if (filters.resolvedWithinDays) {
    params.set("resolvedWithinDays", String(filters.resolvedWithinDays));
  }
  const qs = params.toString();
  return request(`/cards${qs ? `?${qs}` : ""}`);
}

export function listModules(): Promise<string[]> {
  return request("/cards/modules");
}

export function fetchJiraIssue(key: string): Promise<JiraIssuePreview> {
  return request(`/jira/${encodeURIComponent(key)}`);
}

export interface PendingJiraIssue {
  key: string;
  summary: string;
}

export function fetchPendingJiraIssues(): Promise<PendingJiraIssue[]> {
  return request("/jira/pending");
}

export function getCard(id: string): Promise<Card> {
  return request(`/cards/${id}`);
}

export interface TraceProviderInput {
  modelAi: string;
  apiKey: string;
  azureEndpoint?: string;
}

export function createCard(input: {
  jiraKey: string;
  module: string;
  rawTicket: string;
  /** Direcionamento do dev: query, DataWindow, objeto suspeito. */
  devHints?: string;
  images?: CardImage[];
  traceFiles?: CardTraceFile[];
  traceProvider?: TraceProviderInput;
}): Promise<Card> {
  return request("/cards", { method: "POST", body: JSON.stringify(input) });
}

export function resolveCard(
  id: string,
  input?: { note?: string; resolutionText?: string },
): Promise<Card> {
  return request(`/cards/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export function rejectCard(id: string, note?: string): Promise<Card> {
  return request(`/cards/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export function retryCard(id: string, traceProvider?: TraceProviderInput): Promise<Card> {
  return request(`/cards/${id}/retry`, {
    method: "POST",
    body: JSON.stringify({ traceProvider }),
  });
}

/**
 * REVISAO: manda a IA escrever o diff proposto no working copy do SMART Desktop.
 * 422 quando o diff não aplica limpo ou o working copy não está gravável — e aí
 * nada foi alterado no código.
 */
export function applyCardDiff(id: string): Promise<Card> {
  return request(`/cards/${id}/apply`, { method: "POST" });
}

/**
 * REVISAO → VERSIONAMENTO. Não escreve nada no código: só registra que o dev
 * aceitou e leva o card pro estágio onde ele aplica, commita e abre o PR.
 */
export function acceptCard(id: string): Promise<Card> {
  return request(`/cards/${id}/accept`, { method: "POST" });
}

/** Desfaz o apply restaurando os arquivos do backup. */
export function revertCardDiff(id: string): Promise<Card> {
  return request(`/cards/${id}/revert`, { method: "POST" });
}

export function deleteCard(id: string): Promise<void> {
  return request(`/cards/${id}`, { method: "DELETE" });
}

/** Chave de API (header `x-api-key`) ou token OAuth (`Authorization: Bearer`). */
export type AnthropicAuthType = "apiKey" | "oauth";

export interface PlatformSettingsView {
  /** true = há credencial guardada. O valor em si nunca volta do backend. */
  anthropicCredentialSet: boolean;
  anthropicAuthType: AnthropicAuthType;
  model: string;
  aiProvider: string;
  openaiApiKeySet: boolean;
  openaiModel: string;
  traceServiceUrl: string;
  jiraBaseUrl: string;
  jiraAssignedJql: string;
  /** Consulta que o produto entrega de fábrica — habilita o "restaurar padrão". */
  jiraAssignedJqlDefault: string;
  pbInsightUrl: string;
  /** Skill do time colada em Configurações > IA. null = nenhuma configurada. */
  skills: string | null;
  mw20Engine: Mw20Engine | null;
  mw20Host: string | null;
  mw20Port: number | null;
  mw20Database: string | null;
  mw20User: string | null;
  mw20PasswordSet: boolean;
  updatedAt: string;
}

export type Mw20Engine = "sqlserver" | "oracle";

export type PlatformSettingsPatch = Partial<{
  anthropicCredential: string;
  anthropicAuthType: AnthropicAuthType;
  model: string;
  aiProvider: string;
  openaiApiKey: string;
  openaiModel: string;
  traceServiceUrl: string;
  jiraBaseUrl: string;
  jiraAssignedJql: string;
  pbInsightUrl: string;
  skills: string;
  mw20Engine: Mw20Engine | "";
  mw20Host: string;
  mw20Port: number | null;
  mw20Database: string;
  mw20User: string;
  mw20Password: string;
}>;

/** Admin: a conexão gravada com o MW20 abre e lê a tabela usr? */
export function testMw20Connection(): Promise<{ ok: true; latencyMs: number }> {
  return request("/settings/mw20/test", { method: "POST" });
}

export function getSettings(): Promise<PlatformSettingsView> {
  return request("/settings");
}

export function updateSettings(patch: PlatformSettingsPatch): Promise<PlatformSettingsView> {
  return request("/settings", { method: "PATCH", body: JSON.stringify(patch) });
}

export interface ResourceStatus {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
  latencyMs?: number;
}

export interface QueueStats {
  pending: number;
  running: number;
  failed: number;
  /** PENDING com hora marcada no futuro: esperando a cota da IA reabrir. */
  waiting: number;
}

export interface UsageSummary {
  totalRuns: number;
  failedRuns: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byModel: { model: string; runs: number; costUsd: number }[];
  /** De quem é o número: só o de quem olha, ou a plataforma inteira (só admin). */
  escopo: ConsumoEscopo;
}

export type ConsumoEscopo = "meu" | "plataforma";

export interface MonitorSnapshot {
  resources: ResourceStatus[];
  queue: QueueStats;
  usage: UsageSummary;
}

/** `plataforma` só tem efeito para admin — o backend recorta o dev de qualquer jeito. */
export function fetchMonitor(escopo: ConsumoEscopo = "meu"): Promise<MonitorSnapshot> {
  return request(`/monitor${escopo === "plataforma" ? "?escopo=plataforma" : ""}`);
}

// ---- Versionamento (commit, push, PR, comentário no Jira) ------------------

export interface FileToCommit {
  path: string;
  kind: "fonte" | "proibido" | "outro";
  status: string;
  autoSelect: boolean;
}

export interface VersioningPreview {
  currentBranch: string;
  expectedBranch: string;
  onExpectedBranch: boolean;
  remoteUrl: string;
  files: FileToCommit[];
  otherDirtyCount: number;
}

/** Retrato do commit antes de qualquer clique — branch, arquivos e classificação. */
export function getVersioningPreview(id: string): Promise<VersioningPreview> {
  return request(`/cards/${id}/versioning`);
}

export function commitCard(
  id: string,
  input: { files: string[]; message?: string },
): Promise<Card> {
  return request(`/cards/${id}/commit`, { method: "POST", body: JSON.stringify(input) });
}

/** Push da branch + abertura do PR no Bitbucket. */
export function openPullRequest(id: string): Promise<Card> {
  return request(`/cards/${id}/pull-request`, { method: "POST" });
}

export function getJiraCommentDraft(id: string): Promise<{ body: string }> {
  return request(`/cards/${id}/jira-comment`);
}

export function postJiraComment(id: string, body: string): Promise<Card> {
  return request(`/cards/${id}/jira-comment`, { method: "POST", body: JSON.stringify({ body }) });
}

export interface BitbucketAccess {
  fullName: string;
  ok: boolean;
  detail: string;
}

export function testBitbucketConnection(): Promise<BitbucketAccess> {
  return request("/me/bitbucket/test", { method: "POST" });
}

/**
 * Confere a credencial gravada do MW desenv na tabela usr do MW20. Recusa
 * (login inexistente, inativo, senha) volta como erro 422 com a mensagem; o
 * estado validado/não validado fica gravado — recarregue `getMe` depois.
 */
export function testMwCredential(): Promise<{ login: string; nome: string; user: AuthUser }> {
  return request("/me/mw/test", { method: "POST" });
}

// ---- Chat de dúvidas sobre o card -----------------------------------------

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  userName?: string;
  at: string;
}

export function getCardChat(id: string): Promise<ChatMessage[]> {
  return request(`/cards/${id}/chat`);
}

/** Pergunta pontual: o contexto (chamado, análise, proposta, código) é montado no backend. */
export function sendCardQuestion(id: string, content: string): Promise<ChatMessage[]> {
  return request(`/cards/${id}/chat`, { method: "POST", body: JSON.stringify({ content }) });
}

export interface JqlStatus {
  id: string;
  name: string;
}

/** Conferência de uma JQL antes de salvar. `error` = o Jira recusou a consulta. */
export interface JqlPreview {
  total: number;
  keys: string[];
  hidden: JqlStatus[];
  error?: string;
}

export function previewJiraJql(jql: string): Promise<JqlPreview> {
  return request("/jira/jql/preview", { method: "POST", body: JSON.stringify({ jql }) });
}
