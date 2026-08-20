"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LuLoaderCircle, LuLogIn, LuUserPlus, LuWorkflow } from "react-icons/lu";
import { authStatus, bootstrapAdmin, login } from "@/lib/api";
import { setToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authStatus()
      .then((s) => setNeedsBootstrap(s.needsBootstrap))
      .catch(() => setError("não foi possível falar com a API — ela está rodando em localhost:3333?"))
      .finally(() => setChecking(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (needsBootstrap) {
        await bootstrapAdmin({ username, displayName, password });
        setNeedsBootstrap(false);
      }
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
            <p className="text-xs text-zinc-400">
              {needsBootstrap
                ? "Primeiro acesso — crie o usuário administrador"
                : "Entre com sua conta da plataforma"}
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          {needsBootstrap && (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
              Nenhum usuário cadastrado ainda. O primeiro vira administrador e
              poderá criar os demais.
            </p>
          )}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Usuário</span>
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

          {needsBootstrap && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Nome completo</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                placeholder="Seu Nome"
                className="rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={needsBootstrap ? "new-password" : "current-password"}
              placeholder={needsBootstrap ? "mínimo 8 caracteres" : "sua senha"}
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
            {busy ? (
              <LuLoaderCircle className="size-4 animate-spin" />
            ) : needsBootstrap ? (
              <LuUserPlus className="size-4" />
            ) : (
              <LuLogIn className="size-4" />
            )}
            {needsBootstrap ? "Criar administrador e entrar" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
