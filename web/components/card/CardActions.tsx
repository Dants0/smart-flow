"use client";

import { useState } from "react";
import {
  LuCircleCheckBig,
  LuRotateCcw,
  LuLoaderCircle,
  LuRefreshCw,
  LuFilePen,
} from "react-icons/lu";
import type { Card } from "@/lib/types";
import { timeAgo } from "@/lib/time";
import {
  resolveCard,
  rejectCard,
  retryCard,
  applyCardDiff,
  revertCardDiff,
} from "@/lib/api";
import { loadTraceProviderSettings } from "@/lib/settings";

/**
 * Ações dos gates humanos (REVISAO e ERRO). Separado do painel pelo mesmo motivo
 * do CardContent: a página inteira do card precisa oferecer as mesmas ações, e
 * duplicá-las garantiria divergência entre as duas telas.
 */
export function CardActions({
  card,
  onUpdated,
}: {
  card: Card;
  onUpdated: (card: Card) => void;
}) {
  const [rejectNote, setRejectNote] = useState("");
  const [resolutionText, setResolutionText] = useState("");
  const [busy, setBusy] = useState<
    null | "resolve" | "reject" | "retry" | "apply" | "revert"
  >(null);
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
    action: "resolve" | "reject" | "retry" | "apply" | "revert",
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

  if (card.stage !== "REVISAO" && card.stage !== "ERRO") return null;

  return (
    <>
      {error && (
        <p className="border-t border-zinc-200 px-5 pt-3 text-xs text-red-600 dark:border-zinc-800 dark:text-red-400">
          {error}
        </p>
      )}

  {/* ações do gate REVISAO */}
  {card.stage === "REVISAO" && (
    <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
      {/*
        Aplicar o diff é a única operação da plataforma que ESCREVE no
        código. Fica separada de "aceitar e resolver" de propósito: aceitar
        a proposta e mandar a IA escrever são duas decisões, e juntá-las num
        botão só faria o dev alterar arquivo sem ter decidido isso.
      */}
      {card.proposal?.diff &&
        (card.appliedAt ? (
          <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/40">
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <LuCircleCheckBig className="size-3.5" />
              Diff aplicado no código · {timeAgo(card.appliedAt)}
            </div>
            <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-emerald-800 dark:text-emerald-400">
              {card.appliedFiles?.map((f) => (
                <li key={f} className="truncate" title={f}>
                  {f}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-700/80 dark:text-emerald-400/80">
              Alteração local: nada foi commitado. Teste antes de resolver — o
              controle de versão do seu working copy continua sendo a saída final.
            </p>
            <button
              onClick={() => run("revert", () => revertCardDiff(card.id))}
              disabled={busy !== null}
              className="mt-2 flex items-center gap-1.5 rounded-md border border-emerald-300 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
            >
              {busy === "revert" ? (
                <LuLoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <LuRotateCcw className="size-3.5" />
              )}
              Desfazer alteração
            </button>
          </div>
        ) : (
          <button
            onClick={() => run("apply", () => applyCardDiff(card.id))}
            disabled={busy !== null}
            className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950"
          >
            {busy === "apply" ? (
              <LuLoaderCircle className="size-4 animate-spin" />
            ) : (
              <LuFilePen className="size-4" />
            )}
            Aplicar o diff no código
          </button>
        ))}

      <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">
        O que você aplicou de fato?
      </label>
      <textarea
        value={resolutionText}
        onChange={(e) => setResolutionText(e.target.value)}
        placeholder="Ex: o diff da IA não servia; ajustei o WHERE de d_agm09tab pra amarrar paciente + OS."
        rows={3}
        className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <p className="mb-3 mt-1 text-[11px] leading-relaxed text-zinc-400">
        É este texto que vai pra base de conhecimento e alimenta chamados
        futuros. Em branco, a base guarda o diff proposto pela IA — que pode
        não ser o que resolveu.
      </p>

      <textarea
        value={rejectNote}
        onChange={(e) => setRejectNote(e.target.value)}
        placeholder="Nota opcional (ex: por que rejeitou / o que ajustar)"
        rows={2}
        className="mb-3 w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <div className="flex gap-2">
        <button
          onClick={() =>
            run("reject", () => rejectCard(card.id, rejectNote || undefined))
          }
          disabled={busy !== null}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {busy === "reject" ? (
            <LuLoaderCircle className="size-4 animate-spin" />
          ) : (
            <LuRotateCcw className="size-4" />
          )}
          Rejeitar, pedir nova proposta
        </button>
        <button
          onClick={() =>
            run("resolve", () =>
              resolveCard(card.id, {
                note: rejectNote || undefined,
                resolutionText: resolutionText || undefined,
              }),
            )
          }
          disabled={busy !== null}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy === "resolve" ? (
            <LuLoaderCircle className="size-4 animate-spin" />
          ) : (
            <LuCircleCheckBig className="size-4" />
          )}
          Aceitar e resolver
        </button>
      </div>
    </div>
  )}

  {/* ação do gate ERRO */}
  {card.stage === "ERRO" && (
    <div className="border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
      <button
        onClick={handleRetry}
        disabled={busy !== null}
        className="flex w-full items-center justify-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {busy === "retry" ? (
          <LuLoaderCircle className="size-4 animate-spin" />
        ) : (
          <LuRefreshCw className="size-4" />
        )}
        Reprocessar
      </button>
    </div>
  )}
    </>
  );
}
