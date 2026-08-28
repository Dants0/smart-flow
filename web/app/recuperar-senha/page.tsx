"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LuArrowLeft, LuCircleCheck, LuKeyRound, LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";
import { login, resetPassword } from "@/lib/api";
import { setToken } from "@/lib/auth";

/**
 * Recuperação de senha da plataforma: usuário + senha nova, sem provar nada.
 *
 * É provisório e combinado — a plataforma roda só na rede interna, e até aqui
 * quem esquecia a senha só voltava por `psql`. O aviso na tela existe pra que
 * isso não seja confundido com um fluxo pronto: ver o comentário da rota
 * `/auth/reset-password` no backend.
 */
export default function RecuperarSenhaPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  // Errar a senha nova aqui é pior que em qualquer outro campo: ela vira a
  // senha da conta na hora, e o dono descobre no login seguinte sem saber o quê
  // digitou errado.
  const divergem = confirmacao.length > 0 && password !== confirmacao;
  const podeEnviar = username.trim() && password.length >= 8 && password === confirmacao;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetPassword(username.trim(), password);
      setPronto(true);
      // Já entra: a pessoa acabou de provar que sabe a senha — ela escolheu
      // agora — e mandar digitar de novo na tela ao lado não protege nada.
      const { token } = await login(username.trim(), password);
      setToken(token);
      router.push("/");
    } catch (err) {
      setPronto(false);
      setError(err instanceof Error ? err.message : "falha ao redefinir a senha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
            <LuKeyRound className="size-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Redefinir senha
            </h1>
            <p className="text-xs text-zinc-400">Senha da plataforma — não é a do Jira</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
        >
          <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Versão provisória, de uso interno: <strong>qualquer pessoa com acesso a esta
              página pode trocar a senha de qualquer conta.</strong> Cada troca fica registrada
              no log do backend.
            </span>
          </p>

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

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Nova senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="mínimo 8 caracteres"
              className="rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Repita a nova senha</span>
            <input
              type="password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="a mesma de cima"
              className={`rounded-lg border px-3.5 py-2.5 text-sm text-zinc-800 outline-none dark:bg-zinc-950 dark:text-zinc-100 ${
                divergem
                  ? "border-red-400 focus:border-red-500 dark:border-red-800"
                  : "border-zinc-300 focus:border-zinc-500 dark:border-zinc-700"
              }`}
            />
            {divergem && (
              <span className="text-xs text-red-600 dark:text-red-400">as duas não batem</span>
            )}
          </label>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !podeEnviar}
            className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {busy ? (
              <LuLoaderCircle className="size-4 animate-spin" />
            ) : pronto ? (
              <LuCircleCheck className="size-4" />
            ) : (
              <LuKeyRound className="size-4" />
            )}
            {pronto ? "Senha trocada — entrando..." : "Redefinir e entrar"}
          </button>

          <Link
            href="/login"
            className="flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <LuArrowLeft className="size-3.5" />
            Voltar para o login
          </Link>
        </form>
      </div>
    </div>
  );
}
