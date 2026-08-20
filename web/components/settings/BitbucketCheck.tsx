"use client";

import { useState } from "react";
import { LuCircleCheckBig, LuCircleX, LuLoaderCircle, LuPlug } from "react-icons/lu";
import { testBitbucketConnection, type BitbucketAccess } from "@/lib/api";

/**
 * "Testar conexão" do Bitbucket — mesma ideia do teste do Jira: descobrir que a
 * app password está errada **agora**, e não na hora de abrir o PR com o commit
 * já feito.
 *
 * Testa a credencial gravada contra o repositório do `origin` do working copy,
 * então também confirma que o dev tem acesso àquele repositório específico.
 */
export function BitbucketCheck({
  hasCredentials,
  dirty,
}: {
  hasCredentials: boolean;
  dirty: boolean;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<BitbucketAccess | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleTest() {
    setTesting(true);
    setResult(null);
    setError(null);
    try {
      setResult(await testBitbucketConnection());
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao testar");
    } finally {
      setTesting(false);
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
          <span className="text-xs text-zinc-400">preencha usuário e app password primeiro</span>
        )}
        {hasCredentials && dirty && (
          <span className="text-xs text-zinc-400">
            salve antes — o teste usa a credencial gravada
          </span>
        )}
      </div>

      {result && (
        <p className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <LuCircleCheckBig className="size-3.5 shrink-0" />
          {result.detail}
        </p>
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
