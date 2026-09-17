"use client";

import { useCallback, useEffect, useState } from "react";
import { LuGauge, LuLoaderCircle, LuRefreshCw, LuListChecks, LuDollarSign } from "react-icons/lu";
import { fetchMonitor, getMe, type ConsumoEscopo, type MonitorSnapshot } from "@/lib/api";
import { SettingsSection } from "@/components/settings/fields";
import { ResourceCard } from "@/components/settings/ResourceCard";
import { formatUsd } from "@/lib/money";

const POLL_MS = 20000;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-zinc-800 dark:text-zinc-100">{value}</div>
      {hint && <div className="text-[11px] text-zinc-400">{hint}</div>}
    </div>
  );
}

export default function ResourcesPage() {
  const [data, setData] = useState<MonitorSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [escopo, setEscopo] = useState<ConsumoEscopo>("meu");

  useEffect(() => {
    getMe()
      .then((u) => setIsAdmin(u.isAdmin))
      .catch(() => setIsAdmin(false));
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await fetchMonitor(escopo));
      setLastChecked(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao consultar o status");
    } finally {
      setRefreshing(false);
    }
  }, [escopo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount + polling, sem external store pra subscrever
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const onlineCount = data?.resources.filter((r) => r.ok).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        icon={LuGauge}
        title="Monitor de Recursos"
        description="Status ao vivo de tudo que a esteira depende — banco, microserviços, Jira e chaves de IA. Atualiza sozinho a cada 20s."
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {data ? (
              <>
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {onlineCount}/{data.resources.length}
                </span>{" "}
                online
                {lastChecked && ` · checado às ${lastChecked.toLocaleTimeString("pt-BR")}`}
              </>
            ) : (
              "carregando..."
            )}
          </span>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {refreshing ? (
              <LuLoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <LuRefreshCw className="size-3.5" />
            )}
            Atualizar
          </button>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {!data ? (
          <div className="flex items-center gap-2 py-6 text-sm text-zinc-400">
            <LuLoaderCircle className="size-4 animate-spin" />
            Consultando serviços...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.resources.map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>
        )}
      </SettingsSection>

      {data && (
        <>
          <SettingsSection
            icon={LuListChecks}
            title="Fila de processamento"
            description="Os estágios de IA rodam fora do request. Limite de uso do provedor não vira ERRO: o job espera a cota reabrir e retoma sozinho. Job travado por falha real vira ERRO no card após 3 tentativas, e job órfão (backend caiu no meio) volta pra fila no próximo start."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Na fila" value={String(data.queue.pending)} />
              <Stat label="Processando" value={String(data.queue.running)} />
              <Stat
                label="Aguardando cota"
                value={String(data.queue.waiting)}
                hint={data.queue.waiting > 0 ? "limite de uso da IA, retoma sozinho" : undefined}
              />
              <Stat
                label="Falharam"
                value={String(data.queue.failed)}
                hint={data.queue.failed > 0 ? "cards foram pra ERRO" : undefined}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            icon={LuDollarSign}
            title={data.usage.escopo === "plataforma" ? "Consumo de IA da plataforma (30 dias)" : "Meu consumo de IA (30 dias)"}
            description={`${
              data.usage.escopo === "plataforma"
                ? "Soma de todos os usuários."
                : "Só o que você gastou: a esteira dos seus cards e as perguntas que você fez no chat."
            } Custo estimado a partir da tabela de preços por modelo — a fatura do provedor continua sendo a fonte oficial.`}
          >
            {isAdmin && (
              <div className="flex w-fit rounded-md border border-zinc-300 p-0.5 text-xs dark:border-zinc-700">
                {(["meu", "plataforma"] as const).map((opcao) => (
                  <button
                    key={opcao}
                    onClick={() => setEscopo(opcao)}
                    className={`rounded px-2.5 py-1 font-medium ${
                      escopo === opcao
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                        : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {opcao === "meu" ? "Meu consumo" : "Toda a plataforma"}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Custo" value={formatUsd(data.usage.costUsd)} />
              <Stat
                label="Chamadas"
                value={String(data.usage.totalRuns)}
                hint={data.usage.failedRuns > 0 ? `${data.usage.failedRuns} com erro` : undefined}
              />
              <Stat label="Tokens entrada" value={data.usage.inputTokens.toLocaleString("pt-BR")} />
              <Stat label="Tokens saída" value={data.usage.outputTokens.toLocaleString("pt-BR")} />
            </div>

            {data.usage.byModel.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                {data.usage.byModel.map((m) => (
                  <div
                    key={m.model}
                    className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 text-sm last:border-0 dark:border-zinc-800"
                  >
                    <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{m.model}</span>
                    <span className="text-xs text-zinc-500">
                      {m.runs} chamada{m.runs > 1 ? "s" : ""} · {formatUsd(m.costUsd)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {data.usage.totalRuns === 0 && (
              <p className="py-2 text-sm text-zinc-400">Nenhuma chamada registrada nos últimos 30 dias.</p>
            )}
          </SettingsSection>
        </>
      )}
    </div>
  );
}
