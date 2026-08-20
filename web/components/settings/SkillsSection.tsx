"use client";

import { useState } from "react";
import { LuBookOpen, LuTriangleAlert } from "react-icons/lu";
import { updateSettings } from "@/lib/api";
import { SaveBar, SettingsSection, TextAreaField } from "@/components/settings/fields";

/** Mesmo teto do backend (`MAX_SKILL_CHARS` em src/domain/skill.ts). */
const MAX_SKILL_CHARS = 20000;

const PLACEHOLDER = `Cole aqui a skill. Ex.:

## Como eu resolvo chamado de duplicidade no ATENDE

1. Confirmar se o cenário reproduz com pbtrace ligado antes de olhar código.
2. Checar a constraint no banco ANTES de mexer na DataWindow — na maioria das
   vezes o problema está lá, e não na tela.
3. Oracle e SQL Server divergem no tratamento de NULL nesse ponto; validar nos dois.
4. Nunca alterar o w_main_frame: mudança ali derruba todos os módulos.`;

/**
 * Seção SKILLS das configurações de IA. Campo aberto: o dev cola o procedimento
 * que ele segue pra resolver chamado, e esse texto entra no prompt da ANALISE e
 * do DESENVOLVIMENTO.
 *
 * Salva separado do resto da tela de IA de propósito — mexer na skill é uma
 * atividade própria (colar, revisar, ajustar o texto) e não deveria arrastar
 * junto uma troca de provider ou de chave que o dev tenha começado e desistido.
 */
export function SkillsSection({ initialValue }: { initialValue: string }) {
  const [skills, setSkills] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updateSettings({ skills });
      // eco do que o backend gravou: campo esvaziado volta como null
      setSkills(updated.skills ?? "");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const empty = !skills.trim();

  return (
    <SettingsSection
      icon={LuBookOpen}
      title="Skills"
      description="O procedimento que o time segue pra resolver chamado. Entra no prompt da ANALISE e do DESENVOLVIMENTO, junto do CLAUDE.md do módulo e do código trazido pelo PB Insight."
    >
      <TextAreaField
        label="Skill usada nas resoluções"
        hint="Texto livre, markdown aceito. Descreva o MÉTODO — o que checar, em que ordem, o que já foi descartado. Vale na hora, sem reiniciar: o próximo card já roda com ela."
        value={skills}
        onChange={setSkills}
        placeholder={PLACEHOLDER}
        maxChars={MAX_SKILL_CHARS}
      />

      {empty ? (
        <p className="text-xs leading-relaxed text-zinc-400">
          Nenhuma skill configurada — a esteira roda só com o contexto do módulo e o RAG, como
          antes. Esvaziar o campo e salvar remove a skill.
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-400">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            A skill é <strong>global</strong> e vai em <strong>todo card</strong>, de todos os
            módulos — inclusive no custo de tokens de cada análise. O que for específico de um
            módulo rende mais no <code>CLAUDE.md</code> dele.
          </span>
        </p>
      )}

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </SettingsSection>
  );
}
