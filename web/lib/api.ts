import type { Card, CardImage, CardTraceFile, JiraIssuePreview } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Erro ${res.status} em ${path}`);
  }
  return res.json();
}

export function listCards(): Promise<Card[]> {
  return request("/cards");
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

export async function dismissPendingJiraIssue(key: string): Promise<void> {
  const res = await fetch(`${API_URL}/jira/pending/${encodeURIComponent(key)}/dismiss`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Erro ${res.status} ao dispensar`);
  }
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

export function resolveCard(id: string, note?: string): Promise<Card> {
  return request(`/cards/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ note }),
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

export async function deleteCard(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/cards/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Erro ${res.status} ao apagar card`);
  }
}
