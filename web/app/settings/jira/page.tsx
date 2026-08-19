"use client";

import { useEffect, useState } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { getSettings, updateSettings, type PlatformSettingsPatch } from "@/lib/api";
import { TextField, SaveBar } from "@/components/settings/fields";

export default function JiraSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [baseUrl, setBaseUrl] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [jql, setJql] = useState("");

  useEffect(() => {
    getSettings()
      .then((s) => {
        setBaseUrl(s.jiraBaseUrl ?? "");
        setUser(s.jiraUser ?? "");
        setPasswordSet(s.jiraPasswordSet);
        setJql(s.jiraAssignedJql);
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
        jiraBaseUrl: baseUrl,
        jiraUser: user,
        jiraAssignedJql: jql,
      };
      if (password.trim()) patch.jiraPassword = password.trim();

      const updated = await updateSettings(patch);
      setPasswordSet(updated.jiraPasswordSet);
      setPassword("");
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
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Jira</h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          Server/Data Center via Basic Auth — essa instância é anterior a Personal
          Access Tokens. Usado pra buscar chamados e detectar os atribuídos a você.
        </p>
      </div>

      <TextField
        label="URL base"
        value={baseUrl}
        onChange={setBaseUrl}
        placeholder="https://seu-jira.exemplo.com"
      />
      <TextField label="Usuário" value={user} onChange={setUser} placeholder="seu.usuario" />
      <TextField
        label="Senha"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder={passwordSet ? "•••••••• (já configurada — deixe em branco pra manter)" : "sua senha"}
      />
      <TextField
        label="JQL de chamados atribuídos"
        value={jql}
        onChange={setJql}
        hint="Usado pra detectar chamados novos atribuídos a você (aviso no board, nunca cria card sozinho)"
      />

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </div>
  );
}
