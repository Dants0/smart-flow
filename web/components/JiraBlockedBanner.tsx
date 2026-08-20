"use client";

import { useState } from "react";
import Link from "next/link";
import { LuCircleAlert, LuLoaderCircle, LuRotateCcw, LuArrowRight } from "react-icons/lu";
import { unblockJira } from "@/lib/api";
import { HelpTip } from "./HelpTip";
import { JiraTroubleshooting } from "./JiraTroubleshooting";

/**
 * O Jira Server arma um CAPTCHA depois de alguns logins falhados e passa a
 * negar a API mesmo com a senha certa. Como o board consulta o Jira a cada
 * minuto, uma senha desatualizada rearmava o bloqueio logo depois de o dev
 * destravar no navegador — um loop que, de fora, parecia "a Atlassian barrou o
 * Basic Auth".
 *
 * Agora o backend para de tentar e mostra isto: o passo a passo de destravar e
 * o botão que libera as tentativas de novo.
 */
export function JiraBlockedBanner({
  reason,
  onUnblocked,
}: {
  reason: string;
  onUnblocked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnblock() {
    setBusy(true);
    setError(null);
    try {
      await unblockJira();
      onUnblocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao liberar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-red-200 bg-red-50 px-6 py-3 dark:border-red-900 dark:bg-red-950/40">
      <div className="flex items-start gap-3">
        <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-red-800 dark:text-red-300">
            O Jira recusou sua autenticação — parei de tentar
          </p>
          <p className="mt-1 text-xs leading-relaxed text-red-700 dark:text-red-400">{reason}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-red-600/80 dark:text-red-400/70">
            Continuar tentando contaria como login falhado e travaria sua conta de novo — por
            isso as consultas ficam suspensas até você resolver.
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={handleUnblock}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-950"
            >
              {busy ? (
                <LuLoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <LuRotateCcw className="size-3.5" />
              )}
              Já destravei, tentar de novo
            </button>
            <Link
              href="/settings/account"
              className="flex items-center gap-1 text-xs font-medium text-red-700 underline-offset-2 hover:underline dark:text-red-300"
            >
              Regravar minha senha do Jira
              <LuArrowRight className="size-3.5" />
            </Link>
            {/* O passo a passo também mora aqui: quem está travado lê o banner, não a tela de conta. */}
            <HelpTip label="Ajuda para conectar no Jira" title="Como destravar sua conta no Jira">
              <JiraTroubleshooting />
            </HelpTip>
          </div>

          {error && <p className="mt-1.5 text-[11px] text-red-700 dark:text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
