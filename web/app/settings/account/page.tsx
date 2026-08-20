"use client";

import { useEffect, useState } from "react";
import { LuLoaderCircle, LuUser } from "react-icons/lu";
import { getMe, updateMe } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";
import { TextField, SaveBar, SettingsSection, FieldGroup } from "@/components/settings/fields";

export default function AccountSettingsPage() {
  const [me, setMe] = useState<AuthUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [jiraUser, setJiraUser] = useState("");
  const [jiraPassword, setJiraPassword] = useState("");

  useEffect(() => {
    getMe()
      .then((u) => {
        setMe(u);
        setDisplayName(u.displayName);
        setJiraUser(u.jiraUser ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "falha ao carregar"));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const patch: Parameters<typeof updateMe>[0] = { displayName, jiraUser };
      if (password.trim()) patch.password = password.trim();
      if (jiraPassword.trim()) patch.jiraPassword = jiraPassword.trim();

      const updated = await updateMe(patch);
      setMe(updated);
      setPassword("");
      setJiraPassword("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (!me) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <LuLoaderCircle className="size-4 animate-spin" />
        Carregando...
      </div>
    );
  }

  return (
    <SettingsSection
      icon={LuUser}
      title="Minha conta"
      description={`Conectado como ${me.username}${me.isAdmin ? " (administrador)" : ""}. As credenciais do Jira são suas — é com elas que a plataforma busca os chamados atribuídos a você.`}
    >
      {me.setupPending.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <strong>Setup pendente:</strong>{" "}
          {me.setupPending
            .map((s) =>
              s === "password"
                ? "trocar a senha provisória"
                : "configurar suas credenciais do Jira",
            )
            .join(" e ")}
          . Até concluir, os chamados atribuídos a você não aparecem no board.
        </p>
      )}

      <FieldGroup title="Perfil">
        <TextField label="Nome de exibição" value={displayName} onChange={setDisplayName} />
        <TextField
          label={me.mustChangePassword ? "Nova senha (obrigatória)" : "Nova senha"}
          type="password"
          value={password}
          onChange={setPassword}
          placeholder={
            me.mustChangePassword
              ? "sua conta ainda usa a senha provisória"
              : "deixe em branco pra manter a atual"
          }
          hint="Mínimo 8 caracteres."
        />
      </FieldGroup>

      <FieldGroup title="Minhas credenciais do Jira">
        <TextField
          label="Usuário do Jira"
          value={jiraUser}
          onChange={setJiraUser}
          placeholder="seu.usuario"
        />
        <TextField
          label="Senha do Jira"
          type="password"
          value={jiraPassword}
          onChange={setJiraPassword}
          placeholder={
            me.jiraPasswordSet ? "•••••••• (já configurada — deixe em branco pra manter)" : "sua senha do Jira"
          }
          hint="Guardada cifrada no banco (AES-256-GCM). Precisa ser reversível porque o Jira Server só aceita Basic Auth."
        />
      </FieldGroup>

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </SettingsSection>
  );
}
