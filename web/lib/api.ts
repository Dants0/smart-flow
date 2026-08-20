import type { Card, CardImage, CardTraceFile, JiraIssuePreview, Stage } from "./types";
import { getToken, redirectToLogin, type AuthUser } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

/** Rotas públicas — não mandam token e não redirecionam em 401. */
const PUBLIC_PATHS = ["/auth/login", "/auth/status", "/auth/bootstrap"];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
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
    throw new Error(body.error ?? `Erro ${res.status} em ${path}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

// ---- Autenticação ---------------------------------------------------------

export function authStatus(): Promise<{ needsBootstrap: boolean }> {
  return request("/auth/status");
}

export function login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function bootstrapAdmin(input: {
  username: string;
  displayName: string;
  password: string;
}): Promise<AuthUser> {
  return request("/auth/bootstrap", { method: "POST", body: JSON.stringify(input) });
}

export function getMe(): Promise<AuthUser> {
  return request("/me");
}

export function updateMe(patch: {
  displayName?: string;
  password?: string;
  jiraUser?: string;
  jiraPassword?: string;
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

export function dismissPendingJiraIssue(key: string): Promise<void> {
  return request(`/jira/pending/${encodeURIComponent(key)}/dismiss`, { method: "POST" });
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

export function deleteCard(id: string): Promise<void> {
  return request(`/cards/${id}`, { method: "DELETE" });
}

export interface PlatformSettingsView {
  anthropicApiKeySet: boolean;
  model: string;
  aiProvider: string;
  openaiApiKeySet: boolean;
  openaiModel: string;
  traceServiceUrl: string;
  jiraBaseUrl: string | null;
  jiraAssignedJql: string;
  pbInsightUrl: string;
  updatedAt: string;
}

export type PlatformSettingsPatch = Partial<{
  anthropicApiKey: string;
  model: string;
  aiProvider: string;
  openaiApiKey: string;
  openaiModel: string;
  traceServiceUrl: string;
  jiraBaseUrl: string;
  jiraAssignedJql: string;
  pbInsightUrl: string;
}>;

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
}

export interface UsageSummary {
  totalRuns: number;
  failedRuns: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byModel: { model: string; runs: number; costUsd: number }[];
}

export interface MonitorSnapshot {
  resources: ResourceStatus[];
  queue: QueueStats;
  usage: UsageSummary;
}

export function fetchMonitor(): Promise<MonitorSnapshot> {
  return request("/monitor");
}
