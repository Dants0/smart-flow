"use client";

import { useState } from "react";
import {
  LuCircleCheckBig,
  LuRotateCcw,
  LuLoaderCircle,
  LuRefreshCw,
  LuGitPullRequest,
} from "react-icons/lu";
import type { Card } from "@/lib/types";
import { acceptCard, rejectCard, resolveCard, retryCard } from "@/lib/api";
import { loadTraceProviderSettings } from "@/lib/settings";
import { VersioningPanel } from "./VersioningPanel";

/**
 * Ações dos gates humanos.
 *
 * A tela mostrava, ao mesmo tempo, "aplicar o diff", "o que você aplicou de
 * fato" e "aceitar e resolver" — três coisas de momentos diferentes, e ninguém
 * sabia dizer o que cada botão fazia com o código. Agora cada estágio pede uma
 * decisão só:
 *
 *  - **REVISAO**: rejeitar ou **aceitar e versionar**. Aceitar aplica o diff no
 *    working copy mapeado e move o card — é o comportamento pedido pelo time, e
 *    o caminho pro Auto Mode. Se o apply falhar, o card fica onde está.
 *  - **VERSIONAMENTO**: aplicar o diff, commitar, abrir PR, comentar no Jira e
 *    então resolver — cada passo com seu botão (ver VersioningPanel).
 *  - **ERRO**: reprocessar.
 */
export function CardActions({
  card,
  onUpdated,
}: {
  card: Card;
  onUpdated: (card: Card) => void;
}) {
  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState<null | "accept" | "reject" | "retry" | "resolve">(null);
  const [error, setError] = useState<string | null>(null);

  function handleRetry() {
    const settings = card.traceFiles?.length ? loadTraceProviderSettings() : null;
    const traceProvider = settings
      ? {
          modelAi: settings.model,
          apiKey: settings.apiKey,
          ...(settings.azureEndpoint ? { azureEndpoint: settings.azureEndpoint } : {}),
        }
      : undefined;
    run("retry", () => retryCard(card.id, traceProvider));
  }

  async function run(
    action: "accept" | "reject" | "retry" | "resolve",
    fn: () => Promise<Card>,
  ) {
    setBusy(action);
    setError(null);
    try {
      onUpdated(await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha na ação");
    } finally {
      setBusy(null);
    }
  }

  if (card.stage === "VERSIONAMENTO") {
    return <VersioningPanel card={card} onUpdated={onUpdated} />;
  }

  if (card.stage === "ERRO") {
    return (
      <div className="px-5 py-3">
        <button
          onClick={handleRetry}
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {busy === "retry" ? (
            <LuLoaderCircle className="size-4 animate-spin" />
          ) : (
            <LuRefreshCw className="size-4" />
          )}
          Reprocessar
        </button>
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  if (card.stage !== "REVISAO") return null;

  const semDiff = !card.proposal?.diff?.trim();

  return (
    <div className="flex flex-col gap-2 px-5 py-3">
      {/* A nota só aparece quando o dev decide rejeitar — antes ocupava meia tela. */}
      {showReject && (
        <textarea
          value={rejectNote}
          onChange={(e) => setRejectNote(e.target.value)}
          placeholder="O que ajustar na nova proposta? (opcional, mas é o que faz a próxima ser melhor)"
          rows={2}
          autoFocus
          className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            if (!showReject) {
              setShowReject(true);
              return;
            }
            run("reject", () => rejectCard(card.id, rejectNote || undefined));
          }}
          disabled={busy !== null}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {busy === "reject" ? (
            <LuLoaderCircle className="size-4 animate-spin" />
          ) : (
            <LuRotateCcw className="size-4" />
          )}
          {showReject ? "Confirmar: pedir nova proposta" : "Rejeitar, pedir nova proposta"}
        </button>

        <button
          onClick={() => run("accept", () => acceptCard(card.id))}
          disabled={busy !== null || semDiff}
          title={
            semDiff
              ? "Não há diff proposto para versionar — peça nova proposta ou resolva sem versionar"
              : "Aplica o diff no seu working copy e leva o card para Versionamento"
          }
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy === "accept" ? (
            <LuLoaderCircle className="size-4 animate-spin" />
          ) : (
            <LuGitPullRequest className="size-4" />
          )}
          Aceitar e versionar
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-zinc-400">
          Aceitar <strong>aplica o diff no seu working copy</strong> e leva o card para
          Versionamento, onde você commita e abre o PR. A alteração é local e reversível de um
          clique; nada é commitado sem você mandar.
        </p>
        {/* Chamado que se resolve sem PR: caminho discreto, mas existe. */}
        <button
          onClick={() => run("resolve", () => resolveCard(card.id, {}))}
          disabled={busy !== null}
          className="shrink-0 text-[11px] font-medium text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline disabled:opacity-50 dark:hover:text-zinc-300"
        >
          {busy === "resolve" ? (
            <LuLoaderCircle className="inline size-3 animate-spin" />
          ) : (
            <LuCircleCheckBig className="mr-1 inline size-3" />
          )}
          resolver sem versionar
        </button>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
