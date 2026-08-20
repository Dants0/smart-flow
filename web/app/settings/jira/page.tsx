"use client";

import { useEffect, useState } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { SiJira } from "react-icons/si";
import { getSettings, updateSettings, type PlatformSettingsPatch } from "@/lib/api";
import { TextField, SaveBar, SettingsSection } from "@/components/settings/fields";

export default function JiraSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [baseUrl, setBaseUrl] = useState("");
  const [jql, setJql] = useState("");

  useEffect(() => {
    getSettings()
      .then((s) => {
        setBaseUrl(s.jiraBaseUrl ?? "");
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
      const patch: PlatformSettingsPatch = { jiraBaseUrl: baseUrl, jiraAssignedJql: jql };
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
      icon={SiJira}
      title="Jira"
      description="Configuração da instância, compartilhada por todos. As credenciais são pessoais e ficam em Minha conta — é o que faz currentUser() resolver pro dev certo."
    >
      <TextField
        label="URL base da instância"
        value={baseUrl}
        onChange={setBaseUrl}
        placeholder="https://seu-jira.exemplo.com"
        hint="Jira Server/Data Center. Esta versão é anterior a Personal Access Tokens, por isso Basic Auth."
      />
      <TextField
        label="JQL de chamados atribuídos"
        value={jql}
        onChange={setJql}
        hint="Roda com as credenciais de cada usuário, então currentUser() resolve pra quem estiver logado. Só gera aviso no board — nunca cria card sozinho."
      />

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </SettingsSection>
  );
}
