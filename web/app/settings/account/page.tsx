"use client";

import { useEffect, useState } from "react";
import { LuLoaderCircle, LuUser, LuCircleAlert } from "react-icons/lu";
import { getMe, updateMe } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";
import { TextField, SaveBar, SettingsSection, FieldGroup } from "@/components/settings/fields";
import { HelpTip } from "@/components/HelpTip";
import { JiraTroubleshooting } from "@/components/JiraTroubleshooting";
import { JiraConnectionCheck } from "@/components/settings/JiraConnectionCheck";
import { BitbucketCheck } from "@/components/settings/BitbucketCheck";
import { MwDesenvCheck } from "@/components/settings/MwDesenvCheck";

export default function AccountSettingsPage() {
  const [me, setMe] = useState<AuthUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [jiraUser, setJiraUser] = useState("");
  const [jiraPassword, setJiraPassword] = useState("");
  const [gitName, setGitName] = useState("");
  const [gitEmail, setGitEmail] = useState("");
  const [bitbucketUser, setBitbucketUser] = useState("");
  const [bitbucketEmail, setBitbucketEmail] = useState("");
  const [bitbucketAppPassword, setBitbucketAppPassword] = useState("");
  const [mwUser, setMwUser] = useState("");
  const [mwPassword, setMwPassword] = useState("");

  useEffect(() => {
    getMe()
      .then((u) => {
        setMe(u);
        setDisplayName(u.displayName);
        setJiraUser(u.jiraUser ?? "");
        setGitName(u.gitName ?? "");
        setGitEmail(u.gitEmail ?? "");
        setBitbucketUser(u.bitbucketUser ?? "");
        setBitbucketEmail(u.bitbucketEmail ?? "");
        setMwUser(u.mwUser ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "falha ao carregar"));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const patch: Parameters<typeof updateMe>[0] = {
        displayName,
        jiraUser,
        gitName,
        gitEmail,
        bitbucketUser,
        bitbucketEmail,
        mwUser,
      };
      if (password.trim()) patch.password = password.trim();
      if (jiraPassword.trim()) patch.jiraPassword = jiraPassword.trim();
      if (bitbucketAppPassword.trim()) patch.bitbucketAppPassword = bitbucketAppPassword.trim();
      // Sem trim: a senha do MW desenv é comparada exata com a usr.
      if (mwPassword) patch.mwPassword = mwPassword;

      const updated = await updateMe(patch);
      setMe(updated);
      setPassword("");
      setJiraPassword("");
      setBitbucketAppPassword("");
      setMwPassword("");
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
  const mwDirty = !!mwPassword || mwUser !== (me?.mwUser ?? "");
  const bitbucketDirty =
    !!bitbucketAppPassword.trim() ||
    bitbucketUser !== (me?.bitbucketUser ?? "") ||
    bitbucketEmail !== (me?.bitbucketEmail ?? "");

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
        {/* Conta vinculada ao Jira entra com a senha do Jira: senha local não vale. */}
        {!me.jiraUser && (
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
        )}
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
          hint="Atualizada a cada login na plataforma. Guardada cifrada no banco (AES-256-GCM) — precisa ser reversível porque o Jira Server só aceita Basic Auth."
        />

        <JiraConnectionCheck
          hasCredentials={!!me.jiraUser && me.jiraPasswordSet}
          dirty={jiraDirty}
          onTested={setMe}
        />
      </FieldGroup>

      {/*
        Versionamento: commit e PR saem como o dev, não como um robô da
        plataforma — por isso identidade e credencial são pessoais, como as do Jira.
      */}
      <FieldGroup title="Versionamento (Bitbucket)">
        <p className="text-xs leading-relaxed text-zinc-400">
          Usado quando você manda a plataforma commitar e abrir o PR. Opcional: sem isso, a
          esteira funciona igual e você versiona na mão. Crie um{" "}
          <strong>API token</strong> em id.atlassian.com → Security → API tokens, escolhendo o
          app <em>Bitbucket</em> e os escopos <em>read/write de repository</em> e{" "}
          <em>read/write de pull request</em>. As app passwords antigas continuam funcionando,
          mas a Atlassian não deixa mais criar novas.
        </p>
        <p className="text-xs leading-relaxed text-zinc-400">
          A Atlassian pede <strong>identidades diferentes</strong> para cada uso do token: o{" "}
          <strong>usuário</strong> autentica o <em>git push</em>, o <strong>e-mail</strong>{" "}
          autentica a API que abre o PR. Por isso os dois campos abaixo.
        </p>

        <TextField
          label="Nome no commit"
          value={gitName}
          onChange={setGitName}
          placeholder={me.displayName}
          hint="Em branco, usa seu nome de exibição."
        />
        <TextField
          label="E-mail no commit"
          value={gitEmail}
          onChange={setGitEmail}
          placeholder="voce@pixeon.com"
          hint="Sem e-mail o commit não é feito — o git exige identidade."
        />
        <TextField
          label="Usuário do Bitbucket"
          value={bitbucketUser}
          onChange={setBitbucketUser}
          placeholder="seu.usuario"
          hint="Autentica o git push. É o Username do seu perfil, não o e-mail."
        />
        <TextField
          label="E-mail da conta Atlassian"
          value={bitbucketEmail}
          onChange={setBitbucketEmail}
          placeholder="voce@pixeon.com"
          hint="Autentica a API que abre o PR. Em branco, usa o usuário acima — o que só funciona com app password antiga."
        />
        <TextField
          label="API token (ou app password)"
          type="password"
          value={bitbucketAppPassword}
          onChange={setBitbucketAppPassword}
          placeholder={
            me.bitbucketAppPasswordSet
              ? "•••••••• (já configurado — deixe em branco pra manter)"
              : "API token do Bitbucket"
          }
          hint="Guardado cifrado (AES-256-GCM). Nunca é gravado no .git/config do seu working copy."
        />

        <BitbucketCheck
          hasCredentials={!!me.bitbucketUser && me.bitbucketAppPasswordSet}
          dirty={bitbucketDirty}
        />
      </FieldGroup>

      {/*
        MW desenv: login da tabela usr do MW20. Conferido ao salvar — é o que libera
        a geração de versão com a identidade do dev, em Versionamento.
      */}
      <FieldGroup title="MW desenv">
        <p className="text-xs leading-relaxed text-zinc-400">
          Seu login e senha do MW desenv. A plataforma confere na tabela <code>usr</code> do banco
          MW20 (login, senha e usuário ativo); validada, a geração de versão fica liberada com os
          seus dados em Versionamento.
        </p>
        <TextField label="Usuário do MW desenv" value={mwUser} onChange={setMwUser} placeholder="seu login no MW" />
        <TextField
          label="Senha do MW desenv"
          type="password"
          value={mwPassword}
          onChange={setMwPassword}
          placeholder={me.mwPasswordSet ? "•••••••• (já configurada — deixe em branco pra manter)" : "sua senha do MW desenv"}
          hint="Guardada cifrada no banco da plataforma."
        />
        <MwDesenvCheck me={me} dirty={mwDirty} onUpdated={setMe} />
      </FieldGroup>

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </SettingsSection>
  );
}
