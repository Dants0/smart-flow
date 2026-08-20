"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  LuChevronLeft,
  LuLoaderCircle,
  LuExternalLink,
  LuBot,
  LuUser,
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
import { CardContent } from "@/components/card/CardContent";
import { CardActions } from "@/components/card/CardActions";

/**
 * Página inteira do card, aberta pelo número do chamado numa aba nova.
 *
 * Existe porque o painel lateral do board tem 36rem: chamado com print, log de
 * trace, análise e diff não cabe ali sem virar rolagem sem fim. Aqui a leitura é
 * confortável e a aba fica aberta enquanto o dev trabalha no código — o board
 * continua vivo na aba anterior.
 */
export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return <AuthGuard>{() => <CardPageContent id={id} />}</AuthGuard>;
}

function CardPageContent({ id }: { id: string }) {
  const [card, setCard] = useState<Card | null>(null);
  const [jiraBaseUrl, setJiraBaseUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCard(id)
      .then(setCard)
      .catch((err) => setError(err instanceof Error ? err.message : "falha ao carregar o card"));
    // link pro Jira depende da URL da instância, que é configuração global
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

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-black">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
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
          {/* Atalho pro chamado no Jira: comentários e anexos que não vieram pro card estão lá. */}
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

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <CardContent card={card} />
          </div>

          {/* Mesmas ações do painel: quem lê aqui precisa poder decidir aqui. */}
          {(card.stage === "REVISAO" || card.stage === "ERRO") && (
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <CardActions card={card} onUpdated={setCard} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
