"use client";

import { useCallback, useEffect, useState } from "react";
import { LuCircleCheck, LuLoaderCircle, LuRotateCcw, LuTriangleAlert } from "react-icons/lu";
import { SiJira } from "react-icons/si";
import {
  getSettings,
  previewJiraJql,
  updateSettings,
  type JqlPreview,
  type PlatformSettingsPatch,
} from "@/lib/api";
import { TextField, SaveBar, SettingsSection } from "@/components/settings/fields";

export default function JiraSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [baseUrl, setBaseUrl] = useState("");
  const [jql, setJql] = useState("");
  const [jqlPadrao, setJqlPadrao] = useState("");

  const [conferindo, setConferindo] = useState(false);
  const [previa, setPrevia] = useState<JqlPreview | null>(null);
  /** Falha em FALAR com o Jira — diferente de o Jira recusar a consulta. */
  const [falhaAoConferir, setFalhaAoConferir] = useState<string | null>(null);

  const conferir = useCallback(async (consulta: string): Promise<JqlPreview | null> => {
    setConferindo(true);
    setFalhaAoConferir(null);
    try {
      const p = await previewJiraJql(consulta);
      setPrevia(p);
      return p;
    } catch (err) {
      // Jira fora do ar ou credencial faltando: a consulta pode estar ótima, e
      // travar o salvamento por isso seria pior que salvar sem conferir.
      setPrevia(null);
      setFalhaAoConferir(err instanceof Error ? err.message : "não deu pra conferir agora");
      return null;
    } finally {
      setConferindo(false);
    }
  }, []);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setBaseUrl(s.jiraBaseUrl ?? "");
        setJql(s.jiraAssignedJql);
        setJqlPadrao(s.jiraAssignedJqlDefault);
        // Confere de saída: a legenda é o ponto desta tela, e esperar um clique
        // deixaria o dev na mesma situação de antes — dez ids sem nome.
        void conferir(s.jiraAssignedJql);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "falha ao carregar"))
      .finally(() => setLoading(false));
  }, [conferir]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    // Confere ANTES de gravar. JQL inválida salva ficava calada: o board
    // respondia 502 e o dev via "nenhum chamado", sem ligação com a causa.
    const p = await conferir(jql);
    if (p?.error) {
      setError(`O Jira recusou a consulta: ${p.error}`);
      setSaving(false);
      return;
    }

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

  const ehPadrao = jql.trim() === jqlPadrao.trim();

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

      <div className="flex flex-col gap-2">
        <TextField
          label="JQL de chamados atribuídos"
          value={jql}
          onChange={setJql}
          hint="Roda com as credenciais de cada usuário, então currentUser() resolve pra quem estiver logado. Só gera aviso no board — nunca cria card sozinho."
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void conferir(jql)}
            disabled={conferindo || !jql.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {conferindo && <LuLoaderCircle className="size-3.5 animate-spin" />}
            Conferir consulta
          </button>

          <button
            type="button"
            onClick={() => {
              setJql(jqlPadrao);
              void conferir(jqlPadrao);
            }}
            disabled={ehPadrao || conferindo}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <LuRotateCcw className="size-3.5" />
            Restaurar padrão
          </button>

          {ehPadrao && <span className="text-xs text-zinc-400">consulta padrão</span>}
        </div>

        <ResultadoDaConsulta previa={previa} falha={falhaAoConferir} />
      </div>

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </SettingsSection>
  );
}

/**
 * A legenda que faltava: o que a consulta traz e o que ela esconde, com o nome
 * que o dev lê no quadro. Sem isto a tela mostrava só
 * `status not in (19653, 17600, ...)` — dez números, sem como saber o que era
 * cada um sem abrir o Jira.
 */
function ResultadoDaConsulta({
  previa,
  falha,
}: {
  previa: JqlPreview | null;
  falha: string | null;
}) {
  if (falha) {
    return (
      <p className="text-xs text-zinc-400">
        Não deu pra conferir a consulta agora ({falha}). Isso não impede de salvar — mas confira
        depois em Minha conta → Testar conexão.
      </p>
    );
  }

  if (!previa) return null;

  if (previa.error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        <span>
          O Jira recusou esta consulta: {previa.error}
          <br />
          Enquanto ela estiver assim, o aviso de chamados fica vazio.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
      <span className="flex flex-wrap items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
        <LuCircleCheck className="size-3.5 text-emerald-600 dark:text-emerald-500" />
        {previa.total === 0
          ? "A consulta é válida, mas não traz nenhum chamado agora."
          : `${previa.total} ${previa.total === 1 ? "chamado atribuído" : "chamados atribuídos"} a você`}
        {previa.keys.length > 0 && (
          <span className="font-mono text-zinc-400">
            {previa.keys.join(", ")}
            {previa.total > previa.keys.length ? ", ..." : ""}
          </span>
        )}
      </span>

      {previa.hidden.length > 0 && (
        <span>
          Escondendo {previa.hidden.length}{" "}
          {previa.hidden.length === 1 ? "situação" : "situações"}:{" "}
          {previa.hidden.map((s) => s.name).join(" · ")}
        </span>
      )}
    </div>
  );
}
