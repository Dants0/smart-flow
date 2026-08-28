"use client";

import { useEffect, useState } from "react";
import { LuKeyRound, LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";
import {
  getSettings,
  updateSettings,
  type AnthropicAuthType,
  type PlatformSettingsPatch,
} from "@/lib/api";
import { TextField, ChoiceField, SaveBar, SettingsSection, FieldGroup } from "@/components/settings/fields";
import { SkillsSection } from "@/components/settings/SkillsSection";

export default function AiSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState("anthropic");
  const [anthropicCred, setAnthropicCred] = useState("");
  const [anthropicCredSet, setAnthropicCredSet] = useState(false);
  const [anthropicAuthType, setAnthropicAuthType] = useState<AnthropicAuthType>("apiKey");
  // O tipo que veio do banco: comparar com o escolhido é o que diz se a
  // credencial guardada vai ser apagada por esta troca.
  const [tipoSalvo, setTipoSalvo] = useState<AnthropicAuthType>("apiKey");
  const [model, setModel] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiKeySet, setOpenaiKeySet] = useState(false);
  const [openaiModel, setOpenaiModel] = useState("");
  const [skills, setSkills] = useState("");

  useEffect(() => {
    getSettings()
      .then((s) => {
        setProvider(s.aiProvider);
        setAnthropicCredSet(s.anthropicCredentialSet);
        setAnthropicAuthType(s.anthropicAuthType);
        setTipoSalvo(s.anthropicAuthType);
        setModel(s.model);
        setOpenaiKeySet(s.openaiApiKeySet);
        setOpenaiModel(s.openaiModel);
        setSkills(s.skills ?? "");
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
        anthropicAuthType,
      };
      if (anthropicCred.trim()) patch.anthropicCredential = anthropicCred.trim();
      if (openaiKey.trim()) patch.openaiApiKey = openaiKey.trim();

      const updated = await updateSettings(patch);
      setAnthropicCredSet(updated.anthropicCredentialSet);
      setTipoSalvo(updated.anthropicAuthType);
      setOpenaiKeySet(updated.openaiApiKeySet);
      setAnthropicCred("");
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

  // Credencial digitada mas ainda não salva já conta: senão o aviso apareceria
  // enquanto o usuário está justamente preenchendo o campo.
  const anthropicPronta = anthropicCredSet || !!anthropicCred.trim();
  const activeKeySet =
    provider === "openai" ? openaiKeySet || !!openaiKey.trim() : anthropicPronta;
  const missingActiveKey = !activeKeySet;

  // Trocar o tipo apaga a credencial guardada no banco — o backend faz isso de
  // propósito (chave mandada como Bearer só dá 401). Avisa ANTES de salvar,
  // enquanto ainda dá pra colar a nova ou voltar o seletor.
  const trocaApagaCredencial =
    anthropicAuthType !== tipoSalvo && anthropicCredSet && !anthropicCred.trim();

  const rotuloCredencial =
    anthropicAuthType === "oauth" ? "Token OAuth" : "Chave de API";

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        icon={LuKeyRound}
        title="IA"
        description="Provider usado pelo pipeline principal (ANALISE/DESENVOLVIMENTO). O app_trace e a chave pessoal de teste têm configuração própria — ver Serviços e o ícone de chave no board."
      >
        <ChoiceField
          label="Qual IA analisa e propõe o diff"
          hint="Ter as duas chaves configuradas não decide nada — é esta escolha que define quem roda a esteira. Vale na hora, sem reiniciar."
          value={provider}
          onChange={setProvider}
          options={[
            {
              value: "anthropic",
              label: "Anthropic",
              description: model || "claude-sonnet-5",
              // A credencial só é cobrada no provider escolhido: ter só uma
              // configurada é normal.
              warning: anthropicPronta ? undefined : "sem credencial configurada",
            },
            {
              value: "openai",
              label: "OpenAI",
              description: openaiModel || "gpt-4o",
              warning: openaiKeySet || openaiKey.trim() ? undefined : "sem chave configurada",
            },
          ]}
        />

        {missingActiveKey && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <LuTriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>
                {provider === "openai" ? "OpenAI" : "Anthropic"} está selecionada mas não tem
                credencial.
              </strong>{" "}
              Enquanto isso, toda análise vai falhar e o card cai em ERRO. Preencha a credencial
              abaixo ou troque o provider.
            </span>
          </p>
        )}

        <FieldGroup
          title="Anthropic"
          active={provider === "anthropic"}
          badge={
            provider === "anthropic" ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                rodando a esteira
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wide text-zinc-400">inativo</span>
            )
          }
        >
          <ChoiceField
            label="Como autenticar"
            hint="A conta corporativa da Anthropic emite token OAuth (o mesmo CLAUDE_CODE_OAUTH_TOKEN do Claude Code) no lugar de chave de API. Os dois viajam em headers diferentes — mandar um no lugar do outro dá 401."
            value={anthropicAuthType}
            onChange={(v) => setAnthropicAuthType(v as AnthropicAuthType)}
            options={[
              { value: "apiKey", label: "Chave de API", description: "sk-ant-api..." },
              { value: "oauth", label: "Token OAuth", description: "CLAUDE_CODE_OAUTH_TOKEN" },
            ]}
          />

          {trocaApagaCredencial && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <LuTriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Salvar com o tipo trocado <strong>apaga a credencial guardada</strong> — ela não
                serve para o outro header. Cole a nova abaixo, ou volte o seletor.
              </span>
            </p>
          )}

          <TextField
            label={rotuloCredencial}
            type="password"
            value={anthropicCred}
            onChange={setAnthropicCred}
            placeholder={
              anthropicCredSet && anthropicAuthType === tipoSalvo
                ? "•••••••• (já configurada — deixe em branco pra manter)"
                : anthropicAuthType === "oauth"
                  ? "sk-ant-oat..."
                  : "sk-ant-api..."
            }
          />
          <TextField label="Modelo" value={model} onChange={setModel} placeholder="claude-sonnet-5" />
        </FieldGroup>

        <FieldGroup
          title="OpenAI"
          active={provider === "openai"}
          badge={
            provider === "openai" ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                rodando a esteira
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wide text-zinc-400">inativo</span>
            )
          }
        >
          <TextField
            label="API Key"
            type="password"
            value={openaiKey}
            onChange={setOpenaiKey}
            placeholder={openaiKeySet ? "•••••••• (já configurada — deixe em branco pra manter)" : "sk-proj-..."}
          />
          <TextField label="Modelo" value={openaiModel} onChange={setOpenaiModel} placeholder="gpt-4o" />
        </FieldGroup>

        <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
      </SettingsSection>

      <SkillsSection initialValue={skills} />
    </div>
  );
}
