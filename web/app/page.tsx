"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LuPlus,
  LuLoaderCircle,
  LuWorkflow,
  LuKeyRound,
  LuBellRing,
  LuX,
  LuSettings,
  LuLightbulb,
  LuLogOut,
} from "react-icons/lu";
import { SiJira } from "react-icons/si";
import {
  listCards,
  listModules,
  getCard,
  fetchPendingJiraIssues,
  dismissPendingJiraIssue,
  ApiError,
  type PendingJiraIssue,
  type CardSummary,
  type CardFilters,
} from "@/lib/api";
import type { Card } from "@/lib/types";
import { STAGES } from "@/lib/types";
import { loadTraceProviderSettings, type TraceProviderSettings } from "@/lib/settings";
import { BoardColumn } from "@/components/BoardColumn";
import { BoardFilters } from "@/components/BoardFilters";
import { NewCardModal } from "@/components/NewCardModal";
import { CardDetail } from "@/components/CardDetail";
import { SettingsModal } from "@/components/SettingsModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthGuard } from "@/components/AuthGuard";
import { SetupBanner } from "@/components/SetupBanner";
import { JiraBlockedBanner } from "@/components/JiraBlockedBanner";
import { GuideModal } from "@/components/GuideModal";
import { clearToken, type AuthUser } from "@/lib/auth";

const POLL_MS = 5000;
const PENDING_POLL_MS = 60000;
const SEARCH_DEBOUNCE_MS = 350;
/** Guia de primeiros passos: abre sozinho uma vez, depois só pelo botão. */
const GUIDE_SEEN_KEY = "smart-ai-flow:guide-seen";

export default function Home() {
  return <AuthGuard>{(user) => <Board user={user} />}</AuthGuard>;
}

function Board({ user }: { user: AuthUser }) {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newCardInitialKey, setNewCardInitialKey] = useState<string | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // Guia abre sozinho no primeiro acesso e nunca mais — depois fica no botão.
  const [showGuide, setShowGuide] = useState(false);
  const [traceSettings, setTraceSettings] = useState<TraceProviderSettings | null>(null);
  const [pending, setPending] = useState<PendingJiraIssue[]>([]);
  // Jira negou a autenticação: o backend parou de tentar e o polling para junto.
  const [jiraBlocked, setJiraBlocked] = useState<string | null>(
    user.jiraAuthBlocked?.reason ?? null,
  );

  // `filters` muda a cada tecla; `applied` é o que de fato vai pro servidor.
  const [filters, setFilters] = useState<CardFilters>({ resolvedWithinDays: 7 });
  const [applied, setApplied] = useState<CardFilters>({ resolvedWithinDays: 7 });

  function openNewCard(jiraKey?: string) {
    setNewCardInitialKey(jiraKey);
    setShowNew(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage só existe no client
    setTraceSettings(loadTraceProviderSettings());
    listModules().then(setModules).catch(() => {});
  }, []);

  // Debounce da busca: sem isso cada tecla vira uma query no Postgres.
  useEffect(() => {
    const id = setTimeout(() => setApplied(filters), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [filters]);

  const refresh = useCallback(async () => {
    try {
      setCards(await listCards(applied));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "não foi possível falar com a API");
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount + polling
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // O board só carrega o resumo; o card completo (anexos, diff, histórico) vem
  // sob demanda ao abrir o painel — é o que mantém o polling barato.
  useEffect(() => {
    if (!selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpa o detalhe ao fechar o painel
      setSelectedCard(null);
      return;
    }
    let cancelled = false;
    getCard(selectedId)
      .then((card) => {
        if (!cancelled) setSelectedCard(card);
      })
      .catch(() => {
        if (!cancelled) setSelectedId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    // primeiro acesso deste navegador: mostra o guia sem precisar procurar o botão
    if (!window.localStorage.getItem(GUIDE_SEEN_KEY)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- onboarding no mount
      setShowGuide(true);
    }
  }, []);

  const refreshPending = useCallback(async () => {
    try {
      setPending(await fetchPendingJiraIssues());
      setJiraBlocked(null);
    } catch (err) {
      setPending([]);
      // Negação de auth NÃO é ruído: some do board só quando o dev age, e o
      // polling precisa parar pra não rearmar o CAPTCHA na conta dele.
      if (err instanceof ApiError && err.code === 'JIRA_AUTH_BLOCKED') {
        setJiraBlocked(err.message);
      }
      // Jira fora do ar segue ruído; falta de credencial já aparece no SetupBanner.
    }
  }, []);

  useEffect(() => {
    if (user.setupPending.includes("jira")) return; // sem credencial, nem tenta
    if (jiraBlocked) return; // bloqueado: cada tentativa a mais trava a conta de novo
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount + polling
    refreshPending();
    const id = setInterval(refreshPending, PENDING_POLL_MS);
    return () => clearInterval(id);
  }, [refreshPending, user.setupPending, jiraBlocked]);

  async function handleDismissPending(key: string) {
    setPending((prev) => prev.filter((p) => p.key !== key));
    try {
      await dismissPendingJiraIssue(key);
    } catch {
      // se falhar, o próximo poll traz de volta — sem drama
    }
  }

  const visibleStages = cards.some((c) => c.stage === "ERRO")
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
          <p className="text-xs text-zinc-400">{user.displayName}</p>
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
        <button
          onClick={() => setShowGuide(true)}
          className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title="Primeiros passos e boas práticas"
        >
          <LuLightbulb className="size-4" />
          Como usar
        </button>
        <Link
          href="/settings"
          className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title="Configurações da plataforma"
        >
          <LuSettings className="size-4" />
        </Link>
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title={
            traceSettings
              ? `Chave pessoal ativa (${traceSettings.provider})`
              : "Configurar chave de IA para análise de trace"
          }
        >
          <LuKeyRound className="size-4" />
          {traceSettings && <span className="size-1.5 rounded-full bg-emerald-500" />}
        </button>
        <button
          onClick={() => openNewCard()}
          className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          <LuPlus className="size-4" />
          Novo card
        </button>
        <button
          onClick={() => {
            clearToken();
            // hard reload: descarta cards e settings já carregados da sessão anterior
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = "/login";
          }}
          title="Sair"
          className="rounded-md border border-zinc-300 p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <LuLogOut className="size-4" />
        </button>
      </header>

      <SetupBanner user={user} />

      {jiraBlocked && (
        <JiraBlockedBanner reason={jiraBlocked} onUnblocked={() => setJiraBlocked(null)} />
      )}

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {error} — a API está rodando?
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

      <BoardFilters filters={filters} modules={modules} onChange={setFilters} />

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
          onCreated={() => refresh()}
          onError={(msg) => setError(msg)}
        />
      )}

      {selectedCard && (
        <CardDetail
          card={selectedCard}
          onClose={() => setSelectedId(null)}
          onUpdated={(card) => {
            setSelectedCard(card);
            refresh();
          }}
          onDeleted={() => {
            setSelectedId(null);
            refresh();
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

      {showGuide && (
        <GuideModal
          onClose={() => {
            setShowGuide(false);
            window.localStorage.setItem(GUIDE_SEEN_KEY, "1");
          }}
        />
      )}
    </div>
  );
}
