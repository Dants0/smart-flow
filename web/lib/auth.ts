export type SetupStep = "password" | "jira";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  jiraUser: string | null;
  jiraPasswordSet: boolean;
  mustChangePassword: boolean;
  /** Pendências de setup inicial — a UI cobra até ficarem vazias. */
  setupPending: SetupStep[];
  /**
   * Preenchido quando o Jira negou a autenticação (CAPTCHA/401) e o backend
   * parou de tentar. Insistir rearmaria o bloqueio na conta do dev no Jira.
   */
  jiraAuthBlocked?: { at: string; reason: string };
  /** Identidade e credencial de versionamento — commit e PR saem como o dev. */
  gitName: string | null;
  gitEmail: string | null;
  bitbucketUser: string | null;
  bitbucketAppPasswordSet: boolean;
}

const TOKEN_KEY = "smart-ai-flow:token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

/** Redireciona pro login quando a sessão expira ou o token some. */
export function redirectToLogin() {
  if (typeof window === "undefined") return;
  clearToken();
  if (!window.location.pathname.startsWith("/login")) {
    // Hard reload de propósito: é chamado de dentro do fetch (fora da árvore
    // React, sem router disponível) e descarta qualquer estado da SPA que já
    // tenha sido carregado com a sessão antiga.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
}
