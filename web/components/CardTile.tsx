"use client";

import { LuBot, LuUser, LuImage, LuActivity } from "react-icons/lu";
import type { Card } from "@/lib/types";
import { STAGE_OWNER } from "@/lib/types";
import { timeAgo } from "@/lib/time";

function preview(card: Card): string {
  if (card.stage === "ERRO") {
    return card.history[card.history.length - 1]?.note ?? "Falha desconhecida";
  }
  if (card.proposal) return card.proposal.summary;
  if (card.analysis) return card.analysis.rootCause;
  return card.rawTicket;
}

export function CardTile({
  card,
  onClick,
}: {
  card: Card;
  onClick: () => void;
}) {
  const owner = STAGE_OWNER[card.stage];
  const OwnerIcon = owner === "IA" ? LuBot : LuUser;

  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:border-zinc-300 hover:shadow dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          {card.jiraKey}
        </span>
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {card.module}
        </span>
      </div>

      <p className="mb-2 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300">
        {preview(card)}
      </p>

      <div className="flex items-center justify-between text-[11px] text-zinc-400">
        <span className="flex items-center gap-1">
          <OwnerIcon className="size-3" />
          {owner === "IA" ? "IA trabalhando" : "aguardando dev"}
        </span>
        <span className="flex items-center gap-2">
          {!!card.images?.length && (
            <span className="flex items-center gap-0.5" title={`${card.images.length} imagem(ns)`}>
              <LuImage className="size-3" />
              {card.images.length}
            </span>
          )}
          {!!card.traceFiles?.length && (
            <span
              className="flex items-center gap-0.5"
              title={`${card.traceFiles.length} log(s) de trace`}
            >
              <LuActivity className="size-3" />
              {card.traceFiles.length}
            </span>
          )}
          {timeAgo(card.updatedAt)}
        </span>
      </div>
    </button>
  );
}
