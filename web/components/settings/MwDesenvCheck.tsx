"use client";

import { useState } from "react";
import { LuCircleCheckBig, LuCircleX, LuLoaderCircle, LuPlug } from "react-icons/lu";
import { getMe, testMwCredential } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";

/**
 * Estado da credencial do MW desenv + "Conferir na usr".
 *
 * O backend já confere ao salvar; o botão existe para depois — senha trocada no
 * MW desenv, usuário reativado, ou o banco MW20 que estava fora do ar na hora
 * de salvar. É essa validação que libera a geração de versão em VERSIONAMENTO.
 */
export function MwDesenvCheck({
  me,
  dirty,
  onUpdated,
}: {
  me: AuthUser;
  dirty: boolean;
  onUpdated: (user: AuthUser) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCredentials = !!me.mwUser && me.mwPasswordSet;

  async function handleTest() {
    setTesting(true);
    setError(null);
    try {
      onUpdated((await testMwCredential()).user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao conferir");
      // recusa também muda o estado gravado (validada -> não validada)
      getMe().then(onUpdated).catch(() => undefined);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      {hasCredentials && !dirty && (
        <p
          className={`flex items-start gap-2 text-xs leading-relaxed ${
            me.mwValidatedAt ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {me.mwValidatedAt ? (
            <>
              <LuCircleCheckBig className="mt-0.5 size-3.5 shrink-0" />
              Conferida na tabela usr do MW20 em{" "}
              {new Date(me.mwValidatedAt).toLocaleString("pt-BR")}. A geração de versão fica liberada
              pra você em Versionamento.
            </>
          ) : (
            <>
              <LuCircleX className="mt-0.5 size-3.5 shrink-0" />
              Não validada{me.mwValidationError ? `: ${me.mwValidationError}` : " — confira abaixo"}.
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !hasCredentials || dirty}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {testing ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuPlug className="size-4" />}
          Conferir no MW desenv
        </button>
        {!hasCredentials && (
          <span className="text-xs text-zinc-400">preencha usuário e senha do MW desenv primeiro</span>
        )}
        {hasCredentials && dirty && (
          <span className="text-xs text-zinc-400">salve antes — ao salvar a credencial já é conferida</span>
        )}
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
