"use client";

import { useCallback, useEffect, useState } from "react";
import { LuPlus, LuLoaderCircle, LuWorkflow, LuKeyRound, LuBellRing, LuX } from "react-icons/lu";
import { SiJira } from "react-icons/si";
import {
  listCards,
  fetchPendingJiraIssues,
  dismissPendingJiraIssue,
  type PendingJiraIssue,
} from "@/lib/api";
import type { Card } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { loadTraceProviderSettings, type TraceProviderSettings } from "@/lib/settings";
import { BoardColumn } from "@/components/BoardColumn";
import { NewCardModal } from "@/components/NewCardModal";
import { CardDetail } from "@/components/CardDetail";
import { SettingsModal } from "@/components/SettingsModal";

const POLL_MS = 5000;
const PENDING_POLL_MS = 60000;

export default function Home() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newCardInitialKey, setNewCardInitialKey] = useState<string | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [traceSettings, setTraceSettings] = useState<TraceProviderSettings | null>(null);
  const [pending, setPending] = useState<PendingJiraIssue[]>([]);

  function openNewCard(jiraKey?: string) {
    setNewCardInitialKey(jiraKey);
    setShowNew(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage só existe no client; lido após montar pra não divergir da renderização estática do server
    setTraceSettings(loadTraceProviderSettings());
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await listCards();
      setCards(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "não foi possível falar com a API",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount + polling, sem external store pra subscrever
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const refreshPending = useCallback(async () => {
    try {
      const data = await fetchPendingJiraIssues();
      setPending(data);
    } catch {
      // silencioso: aviso é um bônus, não deve poluir o banner de erro principal
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount + polling, mesma justificativa do refresh() de cards acima
    refreshPending();
    const id = setInterval(refreshPending, PENDING_POLL_MS);
    return () => clearInterval(id);
  }, [refreshPending]);

  async function handleDismissPending(key: string) {
    setPending((prev) => prev.filter((p) => p.key !== key));
    try {
      await dismissPendingJiraIssue(key);
    } catch {
      // se falhar, o próximo poll (60s) só traz ele de volta — sem drama
    }
  }

  function upsertCard(card: Card) {
    setCards((prev) => {
      const idx = prev.findIndex((c) => c.id === card.id);
      if (idx === -1) return [card, ...prev];
      const next = [...prev];
      next[idx] = card;
      return next;
    });
  }

  const selected = cards.find((c) => c.id === selectedId) ?? null;
  const visibleStages =
    cards.some((c) => c.stage === "ERRO")
      ? STAGES
      : STAGES.filter((s) => s !== "ERRO");

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <LuWorkflow className="size-5 text-zinc-700 dark:text-zinc-300" />
        <div>
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            SMART AI Flow
          </h1>
          <p className="text-xs text-zinc-400">
            Esteira de IA para chamados do SMART
          </p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title={
            traceSettings
              ? `Chave pessoal ativa (${traceSettings.provider})`
              : "Configurar chave de IA para análise de trace"
          }
        >
          <LuKeyRound className="size-4" />
          {traceSettings && (
            <span className="size-1.5 rounded-full bg-emerald-500" />
          )}
        </button>
        <button
          onClick={() => openNewCard()}
          className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          <LuPlus className="size-4" />
          Novo card
        </button>
      </header>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error} — a API está rodando em localhost:3333?
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-1.5 border-b border-amber-200 bg-amber-50 px-6 py-3 dark:border-amber-900 dark:bg-amber-950/40">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            <LuBellRing className="size-3.5" />
            {pending.length === 1
              ? "1 chamado novo atribuído a você no Jira"
              : `${pending.length} chamados novos atribuídos a você no Jira`}
          </div>
          <div className="flex flex-wrap gap-2">
            {pending.map((p) => (
              <div
                key={p.key}
                className="flex items-center gap-2 rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-xs dark:border-amber-800 dark:bg-zinc-900"
              >
                <SiJira className="size-3 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                  {p.key}
                </span>
                <span className="max-w-[220px] truncate text-zinc-500">{p.summary}</span>
                <button
                  onClick={() => {
                    handleDismissPending(p.key);
                    openNewCard(p.key);
                  }}
                  className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-700 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-300 dark:hover:bg-amber-800"
                >
                  Criar card
                </button>
                <button
                  onClick={() => handleDismissPending(p.key)}
                  title="Dispensar"
                  className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                >
                  <LuX className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <main className="flex flex-1 gap-4 overflow-x-auto p-6">
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-zinc-400">
            <LuLoaderCircle className="size-5 animate-spin" />
          </div>
        ) : (
          visibleStages.map((stage) => (
            <BoardColumn
              key={stage}
              stage={stage}
              cards={cards.filter((c) => c.stage === stage)}
              onSelect={(card) => setSelectedId(card.id)}
            />
          ))
        )}
      </main>

      {showNew && (
        <NewCardModal
          initialJiraKey={newCardInitialKey}
          onClose={() => setShowNew(false)}
          onCreated={upsertCard}
          onError={(msg) => setError(msg)}
        />
      )}

      {selected && (
        <CardDetail
          card={selected}
          onClose={() => setSelectedId(null)}
          onUpdated={upsertCard}
          onDeleted={(id) => {
            setCards((prev) => prev.filter((c) => c.id !== id));
            setSelectedId(null);
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          current={traceSettings}
          onClose={() => setShowSettings(false)}
          onSaved={setTraceSettings}
        />
      )}
    </div>
  );
}
