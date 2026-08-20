"use client";

import Link from "next/link";
import { LuBot, LuUser, LuImage, LuActivity, LuTriangleAlert, LuMaximize2 } from "react-icons/lu";
import type { CardSummary } from "@/lib/api";
import { STAGE_OWNER } from "@/lib/types";
import { timeAgo } from "@/lib/time";
import { systemLabel } from "@/lib/systems";

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
    /*
     * Div com role="button" em vez de <button>: o número do chamado agora é um
     * link de verdade, e âncora dentro de botão é HTML inválido — o navegador
     * desmonta a marcação e o clique passa a se comportar de um jeito em cada
     * um. Com div, os dois alvos convivem: o número abre a página do card em
     * outra aba, o resto do cartão abre o painel lateral.
     */
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        // teclado precisa continuar abrindo o card como abria com <button>
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="w-full cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:border-zinc-300 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Link
          href={`/cards/${card.id}`}
          target="_blank"
          rel="noopener noreferrer"
          // sem isto, o clique no número abriria o painel atrás da aba nova
          onClick={(e) => e.stopPropagation()}
          title="Abrir o chamado inteiro numa nova aba"
          className="group flex items-center gap-1 font-mono text-xs font-semibold text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {card.jiraKey}
          <LuMaximize2 className="size-3 text-zinc-300 transition group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-300" />
        </Link>
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {systemLabel(card.module)}
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
    </div>
  );
}
