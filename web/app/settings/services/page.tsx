"use client";

import { useEffect, useState } from "react";
import { LuLoaderCircle, LuServer } from "react-icons/lu";
import { getSettings, updateSettings, type PlatformSettingsPatch } from "@/lib/api";
import { TextField, SaveBar, SettingsSection } from "@/components/settings/fields";

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
    <SettingsSection
      icon={LuServer}
      title="Serviços"
      description="URLs dos microserviços que a esteira consulta. Cada um roda como processo separado — isso só diz onde encontrá-los. Status ao vivo fica no Monitor de Recursos."
    >
      <TextField
        label="app_trace (análise de log de trace)"
        value={traceServiceUrl}
        onChange={setTraceServiceUrl}
        placeholder="http://localhost:8070"
      />
      <TextField
        label="PB Insight (RAG sobre o codebase + base de tickets)"
        value={pbInsightUrl}
        onChange={setPbInsightUrl}
        placeholder="http://127.0.0.1:4500"
      />

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </SettingsSection>
  );
}
