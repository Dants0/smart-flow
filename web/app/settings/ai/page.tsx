"use client";

import { useEffect, useState } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { getSettings, updateSettings, type PlatformSettingsPatch } from "@/lib/api";
import { TextField, SelectField, SaveBar } from "@/components/settings/fields";

export default function AiSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState("anthropic");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [anthropicKeySet, setAnthropicKeySet] = useState(false);
  const [model, setModel] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiKeySet, setOpenaiKeySet] = useState(false);
  const [openaiModel, setOpenaiModel] = useState("");

  useEffect(() => {
    getSettings()
      .then((s) => {
        setProvider(s.aiProvider);
        setAnthropicKeySet(s.anthropicApiKeySet);
        setModel(s.model);
        setOpenaiKeySet(s.openaiApiKeySet);
        setOpenaiModel(s.openaiModel);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "falha ao carregar"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const patch: PlatformSettingsPatch = {
        aiProvider: provider,
        model,
        openaiModel,
      };
      if (anthropicKey.trim()) patch.anthropicApiKey = anthropicKey.trim();
      if (openaiKey.trim()) patch.openaiApiKey = openaiKey.trim();

      const updated = await updateSettings(patch);
      setAnthropicKeySet(updated.anthropicApiKeySet);
      setOpenaiKeySet(updated.openaiApiKeySet);
      setAnthropicKey("");
      setOpenaiKey("");
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
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">IA</h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          Provider usado pelo pipeline principal (ANALISE/DESENVOLVIMENTO). O
          app_trace e a chave pessoal de teste têm configuração própria (ver
          Serviços e o ícone de chave no board).
        </p>
      </div>

      <SelectField
        label="Provider ativo"
        value={provider}
        onChange={setProvider}
        options={[
          { value: "anthropic", label: "Anthropic" },
          { value: "openai", label: "OpenAI" },
        ]}
      />

      <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Anthropic
        </h3>
        <div className="flex flex-col gap-3">
          <TextField
            label="API Key"
            type="password"
            value={anthropicKey}
            onChange={setAnthropicKey}
            placeholder={anthropicKeySet ? "•••••••• (já configurada — deixe em branco pra manter)" : "sk-ant-..."}
          />
          <TextField label="Modelo" value={model} onChange={setModel} placeholder="claude-sonnet-5" />
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          OpenAI
        </h3>
        <div className="flex flex-col gap-3">
          <TextField
            label="API Key"
            type="password"
            value={openaiKey}
            onChange={setOpenaiKey}
            placeholder={openaiKeySet ? "•••••••• (já configurada — deixe em branco pra manter)" : "sk-proj-..."}
          />
          <TextField label="Modelo" value={openaiModel} onChange={setOpenaiModel} placeholder="gpt-4o" />
        </div>
      </div>

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </div>
  );
}
