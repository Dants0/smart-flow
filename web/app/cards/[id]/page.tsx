"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  LuChevronLeft,
  LuLoaderCircle,
  LuExternalLink,
  LuBot,
  LuUser,
  LuMessageSquare,
  LuFileCode,
} from "react-icons/lu";
import { SiJira } from "react-icons/si";
import { getCard, getSettings } from "@/lib/api";
import type { Card } from "@/lib/types";
import { STAGE_META } from "@/lib/stageMeta";
import { STAGE_OWNER } from "@/lib/types";
import { timeAgo } from "@/lib/time";
import { systemLabel } from "@/lib/systems";
import { AuthGuard } from "@/components/AuthGuard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ChangePlan } from "@/components/card/ChangePlan";
import { CardEvidence } from "@/components/card/CardEvidence";
import { CardChat } from "@/components/card/CardChat";
import { CardActions } from "@/components/card/CardActions";

/**
 * Revisão completa do chamado.
 *
 * A pergunta que esta tela responde, nesta ordem: **o que muda**, **onde muda**,
 * **por quê** — e só então a evidência (chamado, raciocínio, histórico), ao lado
 * e recolhida. A versão anterior era um scroll único que empurrava o diff pro
 * meio do caminho.
 *
 * As ações do gate ficam numa barra fixa embaixo: decidir não pode depender de
 * ter rolado até o fim.
 */
export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AuthGuard>{() => <CardPageContent id={id} />}</AuthGuard>;
}

function CardPageContent({ id }: { id: string }) {
  const [card, setCard] = useState<Card | null>(null);
  const [jiraBaseUrl, setJiraBaseUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aside, setAside] = useState<"evidencia" | "chat">("evidencia");

  useEffect(() => {
    getCard(id)
      .then(setCard)
      .catch((err) => setError(err instanceof Error ? err.message : "falha ao carregar o card"));
    getSettings()
      .then((s) => setJiraBaseUrl(s.jiraBaseUrl))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    document.title = card ? `${card.jiraKey} · SMART AI Flow` : "SMART AI Flow";
  }, [card]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-50 dark:bg-black">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <Link href="/" className="text-sm text-zinc-500 underline underline-offset-4">
          Voltar pro board
        </Link>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-400">
        <LuLoaderCircle className="size-4 animate-spin" />
        Carregando chamado...
      </div>
    );
  }

  const meta = STAGE_META[card.stage];
  const Icon = meta.icon;
  const owner = STAGE_OWNER[card.stage];
  const OwnerIcon = owner === "IA" ? LuBot : LuUser;
  const hasActions = card.stage === "REVISAO" || card.stage === "ERRO";

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-black">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
        >
          <LuChevronLeft className="size-4" />
          Board
        </Link>

        <div className="ml-2 flex flex-wrap items-center gap-2 border-l border-zinc-200 pl-4 dark:border-zinc-800">
          <h1 className="font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {card.jiraKey}
          </h1>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {systemLabel(card.module)}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.chip}`}
          >
            <Icon className="size-3.5" />
            {meta.label}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-zinc-400">
            <OwnerIcon className="size-3" />
            {owner === "IA" ? "IA trabalhando" : "aguardando dev"} · criado {timeAgo(card.createdAt)}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {jiraBaseUrl && (
            <a
              href={`${jiraBaseUrl.replace(/\/$/, "")}/browse/${card.jiraKey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <SiJira className="size-3.5" />
              Ver no Jira
              <LuExternalLink className="size-3" />
            </a>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Coluna principal: o plano de mudança. */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-6">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <ChangePlan card={card} />
            </div>
          </div>
        </main>

        {/*
          Coluna de apoio, com duas abas: a evidência (de onde a proposta saiu) e
          o chat. Ficam no mesmo espaço porque o dev usa uma de cada vez —
          confere a análise, ou pergunta sobre ela.
        */}
        <aside className="hidden w-[26rem] shrink-0 flex-col border-l border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 lg:flex">
          <div className="flex shrink-0 gap-1 border-b border-zinc-200 px-3 pt-3 dark:border-zinc-800">
            {(
              [
                ["evidencia", "Evidência", LuFileCode],
                ["chat", "Perguntar", LuMessageSquare],
              ] as const
            ).map(([key, label, TabIcon]) => (
              <button
                key={key}
                onClick={() => setAside(key)}
                className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium transition ${
                  aside === key
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                <TabIcon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          {aside === "evidencia" ? (
            <div className="flex-1 overflow-y-auto p-3">
              <CardEvidence card={card} />
            </div>
          ) : (
            <div className="flex-1 overflow-hidden bg-white dark:bg-zinc-900">
              <CardChat cardId={card.id} />
            </div>
          )}
        </aside>
      </div>

      {/* Em telas estreitas a coluna some: evidência e chat viram blocos no fim. */}
      <div className="border-t border-zinc-200 bg-white lg:hidden dark:border-zinc-800 dark:bg-zinc-900">
        <details className="px-6 py-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Evidência e perguntas
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            <CardEvidence card={card} />
            <div className="h-96 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
              <CardChat cardId={card.id} />
            </div>
          </div>
        </details>
      </div>

      {/* Barra de decisão: sempre visível, sem depender de rolagem. */}
      {hasActions && (
        <div className="shrink-0 border-t border-zinc-200 bg-white shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.2)] dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto max-w-3xl">
            <CardActions card={card} onUpdated={setCard} />
          </div>
        </div>
      )}
    </div>
  );
}
