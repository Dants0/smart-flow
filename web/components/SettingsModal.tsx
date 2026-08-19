"use client";

import { useState } from "react";
import { LuX, LuKeyRound, LuInfo, LuTrash2 } from "react-icons/lu";
import {
  type AiProvider,
  type TraceProviderSettings,
  PROVIDER_LABEL,
  PROVIDER_DEFAULT_MODEL,
  saveTraceProviderSettings,
  clearTraceProviderSettings,
} from "@/lib/settings";

const PROVIDERS = Object.keys(PROVIDER_LABEL) as AiProvider[];

export function SettingsModal({
  current,
  onClose,
  onSaved,
}: {
  current: TraceProviderSettings | null;
  onClose: () => void;
  onSaved: (settings: TraceProviderSettings | null) => void;
}) {
  const [provider, setProvider] = useState<AiProvider>(current?.provider ?? "openai");
  const [model, setModel] = useState(current?.model ?? PROVIDER_DEFAULT_MODEL.openai);
  const [apiKey, setApiKey] = useState(current?.apiKey ?? "");
  const [azureEndpoint, setAzureEndpoint] = useState(current?.azureEndpoint ?? "");

  function handleProviderChange(next: AiProvider) {
    setProvider(next);
    // só troca o modelo se ainda estiver no default do provider anterior —
    // não pisa em um modelo que o dev já customizou
    if (model === PROVIDER_DEFAULT_MODEL[provider]) {
      setModel(PROVIDER_DEFAULT_MODEL[next]);
    }
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim() || !model.trim()) return;
    const settings: TraceProviderSettings = {
      provider,
      model: model.trim(),
      apiKey: apiKey.trim(),
      ...(provider === "azure" && azureEndpoint.trim()
        ? { azureEndpoint: azureEndpoint.trim() }
        : {}),
    };
    saveTraceProviderSettings(settings);
    onSaved(settings);
    onClose();
  }

  function handleClear() {
    clearTraceProviderSettings();
    onSaved(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            <LuKeyRound className="size-4" />
            Chave de IA para análise de trace
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <LuX className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-4 px-5 py-4">
          <p className="flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            <LuInfo className="mt-0.5 size-3.5 shrink-0" />
            Fica salva só neste navegador (localStorage), nunca vai pro banco do
            backend. Usada só na chamada ao app_trace (análise de log de trace) —
            o restante da esteira continua no token corporativo.
          </p>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Provedor
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Modelo
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={PROVIDER_DEFAULT_MODEL[provider]}
              required
              className="rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            API Key
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type="password"
              placeholder="sk-..."
              required
              autoComplete="off"
              className="rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          {provider === "azure" && (
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Azure Endpoint
              <input
                value={azureEndpoint}
                onChange={(e) => setAzureEndpoint(e.target.value)}
                placeholder="https://sua-empresa.openai.azure.com/"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleClear}
              disabled={!current}
              className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-40 dark:text-red-400"
            >
              <LuTrash2 className="size-3.5" />
              Remover chave
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Salvar
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
