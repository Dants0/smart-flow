"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LuLoaderCircle, LuLogIn, LuWorkflow } from "react-icons/lu";
import { authStatus, login } from "@/lib/api";
import { setToken } from "@/lib/auth";

/**
 * Login com a conta do Jira. Não há cadastro nem "primeiro acesso": quem o Jira
 * aceita entra, e a conta na plataforma nasce nesse momento (o primeiro a
 * entrar vira administrador). A senha digitada aqui também passa a ser a que a
 * esteira usa para buscar os chamados — ver `/auth/login` no backend.
 */
export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [jiraBaseUrl, setJiraBaseUrl] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authStatus()
      .then((s) => setJiraBaseUrl(s.jiraBaseUrl))
      .catch(() => setError("não foi possível falar com a API — ela está rodando em localhost:3333?"))
      .finally(() => setChecking(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await login(username, password);
      setToken(token);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao entrar");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50 dark:bg-black">
        <LuLoaderCircle className="size-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  const jiraHost = jiraBaseUrl?.replace(/^https?:\/\//, "");

  return (
    <div className="flex h-full items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
            <LuWorkflow className="size-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              SMART AI Flow
            </h1>
            <p className="text-xs text-zinc-400">Entre com seu usuário e senha do Jira</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Usuário do Jira</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              placeholder="seu.usuario"
              className="rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Senha do Jira</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="a mesma do portal"
              className="rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {busy ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuLogIn className="size-4" />}
            Entrar
          </button>

          {/* A senha é a do Jira: recuperar aqui não faz sentido, e a tela
              pública de recuperação recusa contas vinculadas ao Jira. */}
          {jiraHost && (
            <p className="text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              A senha é conferida em{" "}
              <a
                href={jiraBaseUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                {jiraHost}
              </a>
              . Esqueceu? Recupere pelo próprio Jira.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
