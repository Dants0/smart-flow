"use client";

import { LuBot, LuUser, LuImage, LuActivity, LuTriangleAlert } from "react-icons/lu";
import type { CardSummary } from "@/lib/api";
import { STAGE_OWNER } from "@/lib/types";
import { timeAgo } from "@/lib/time";

export function CardTile({
  card,
  onClick,
}: {
  card: CardSummary;
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
        {card.preview}
      </p>

      <div className="flex items-center justify-between text-[11px] text-zinc-400">
        <span className="flex items-center gap-1">
          <OwnerIcon className="size-3" />
          {owner === "IA" ? "IA trabalhando" : "aguardando dev"}
        </span>
        <span className="flex items-center gap-2">
          {/* análise sem código real: quem olha o board precisa saber antes de abrir */}
          {!card.grounded && (
            <span
              className="flex items-center text-amber-500"
              title="Análise feita sem contexto de código (PB Insight indisponível)"
            >
              <LuTriangleAlert className="size-3" />
            </span>
          )}
          {card.imageCount > 0 && (
            <span className="flex items-center gap-0.5" title={`${card.imageCount} imagem(ns)`}>
              <LuImage className="size-3" />
              {card.imageCount}
            </span>
          )}
          {card.traceFileCount > 0 && (
            <span
              className="flex items-center gap-0.5"
              title={`${card.traceFileCount} log(s) de trace`}
            >
              <LuActivity className="size-3" />
              {card.traceFileCount}
            </span>
          )}
          {timeAgo(card.updatedAt)}
        </span>
      </div>
    </button>
  );
}
