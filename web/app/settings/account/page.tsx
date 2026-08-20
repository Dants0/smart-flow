"use client";

import { useEffect, useState } from "react";
import { LuLoaderCircle, LuUser, LuCircleAlert } from "react-icons/lu";
import { getMe, updateMe } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";
import { TextField, SaveBar, SettingsSection, FieldGroup } from "@/components/settings/fields";
import { HelpTip } from "@/components/HelpTip";
import { JiraTroubleshooting } from "@/components/JiraTroubleshooting";
import { JiraConnectionCheck } from "@/components/settings/JiraConnectionCheck";

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

  // Campos do Jira alterados e ainda não salvos: o teste usa a credencial
  // gravada, então testar agora responderia sobre a senha antiga.
  const jiraDirty = !!jiraPassword.trim() || jiraUser !== (me?.jiraUser ?? "");

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

      <FieldGroup
        title="Minhas credenciais do Jira"
        badge={
          <HelpTip
            label="Ajuda para conectar no Jira"
            title="Não estou conseguindo conectar no Jira"
          >
            <JiraTroubleshooting />
          </HelpTip>
        }
      >
        {/*
          Bloqueio de auth: o backend parou de consultar o Jira com esta conta.
          Salvar a senha aqui é o que libera — por isso o aviso mora neste grupo,
          e não numa tela separada.
        */}
        {me.jiraAuthBlocked && (
          <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>O Jira recusou esta credencial</strong> em{" "}
              {new Date(me.jiraAuthBlocked.at).toLocaleString("pt-BR")}, e as consultas estão
              suspensas. {me.jiraAuthBlocked.reason} Salvar a senha abaixo libera as tentativas
              de novo.
            </span>
          </p>
        )}
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

        <JiraConnectionCheck
          hasCredentials={!!me.jiraUser && me.jiraPasswordSet}
          dirty={jiraDirty}
          onTested={setMe}
        />
      </FieldGroup>

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </SettingsSection>
  );
}
