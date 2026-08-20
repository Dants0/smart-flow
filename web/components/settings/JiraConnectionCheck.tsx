"use client";

import { useState } from "react";
import {
  LuCircleCheckBig,
  LuCircleX,
  LuLoaderCircle,
  LuPlug,
  LuTriangleAlert,
} from "react-icons/lu";
import { getMe, testJiraConnection, type JiraConnectionTest } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";

/**
 * "Testar conexão" das credenciais do Jira.
 *
 * Fecha o ciclo do dev que está configurando: antes disto ele salvava a senha e
 * só descobria se funcionou quando o board consultasse, um minuto depois e sem
 * dizer o que falhou.
 *
 * Testa a credencial **salva**, nunca o que está digitado na tela: testar uma
 * senha que ainda não foi gravada daria um resultado que não corresponde ao que
 * a esteira vai usar — e é a esteira que trava a conta do dev no Jira quando a
 * credencial está errada. Por isso o botão espera salvar.
 */
export function JiraConnectionCheck({
  hasCredentials,
  dirty,
  onTested,
}: {
  hasCredentials: boolean;
  /** Há alteração não salva nos campos do Jira. */
  dirty: boolean;
  /** Devolve o usuário atualizado — o teste pode ter mudado o estado de bloqueio. */
  onTested: (user: AuthUser) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<JiraConnectionTest | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleTest() {
    setTesting(true);
    setResult(null);
    setError(null);
    try {
      setResult(await testJiraConnection());
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao testar");
    } finally {
      setTesting(false);
      // o teste libera o bloqueio antes de tentar e pode rearmá-lo: recarrega
      // pra tela não continuar mostrando o estado anterior
      getMe().then(onTested).catch(() => {});
    }
  }

  const blocked = !hasCredentials || dirty;

  return (
    <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || blocked}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {testing ? (
            <LuLoaderCircle className="size-4 animate-spin" />
          ) : (
            <LuPlug className="size-4" />
          )}
          Testar conexão
        </button>

        {!hasCredentials && (
          <span className="text-xs text-zinc-400">preencha usuário e senha primeiro</span>
        )}
        {hasCredentials && dirty && (
          <span className="text-xs text-zinc-400">
            salve antes — o teste usa a credencial gravada
          </span>
        )}
      </div>

      {result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <p className="flex items-center gap-1.5 font-medium">
            <LuCircleCheckBig className="size-3.5 shrink-0" />
            Conectado como {result.displayName} ({result.username}) · {result.latencyMs} ms
          </p>

          {/* Autenticar e enxergar chamado são coisas diferentes — o dev precisa ver as duas. */}
          {result.jqlError ? (
            <p className="mt-1 flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
              <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              Autenticação OK, mas a busca de chamados falhou: {result.jqlError}
            </p>
          ) : (
            <p className="mt-1">
              {result.assignedCount === 0
                ? "Nenhum chamado atribuído a você no momento — a busca funcionou, só não há resultado."
                : `${result.assignedCount} chamado(s) atribuído(s) a você.`}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <LuCircleX className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
