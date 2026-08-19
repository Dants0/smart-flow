"use client";

import { useEffect, useState } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { getSettings, updateSettings, type PlatformSettingsPatch } from "@/lib/api";
import { TextField, SaveBar } from "@/components/settings/fields";

export default function ServicesSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [traceServiceUrl, setTraceServiceUrl] = useState("");
  const [pbInsightUrl, setPbInsightUrl] = useState("");

  useEffect(() => {
    getSettings()
      .then((s) => {
        setTraceServiceUrl(s.traceServiceUrl);
        setPbInsightUrl(s.pbInsightUrl);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "falha ao carregar"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const patch: PlatformSettingsPatch = { traceServiceUrl, pbInsightUrl };
      await updateSettings(patch);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <LuLoaderCircle className="size-4 animate-spin" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Serviços</h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          URLs dos microserviços que a esteira consulta. Cada um roda como processo
          separado — isso só diz onde encontrá-los.
        </p>
      </div>

      <TextField
        label="app_trace (análise de log de trace)"
        value={traceServiceUrl}
        onChange={setTraceServiceUrl}
        placeholder="http://localhost:8070"
      />
      <TextField
        label="PB Insight (RAG sobre o codebase)"
        value={pbInsightUrl}
        onChange={setPbInsightUrl}
        placeholder="http://127.0.0.1:4500"
      />

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </div>
  );
}
