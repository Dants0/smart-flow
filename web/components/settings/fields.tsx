"use client";

import { LuCheck, LuLoaderCircle } from "react-icons/lu";
import type { IconType } from "react-icons";

export function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: IconType;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start gap-3 border-b border-zinc-100 px-6 py-5 dark:border-zinc-800">
        {Icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            <Icon className="size-4" />
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-4 px-6 py-5">{children}</div>
    </section>
  );
}

export function FieldGroup({
  title,
  children,
  active,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  /** Destaca o grupo como o que está de fato em uso. */
  active?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border p-4 transition ${
        active
          ? "border-zinc-900 bg-white shadow-sm dark:border-zinc-100 dark:bg-zinc-900"
          : "border-zinc-100 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-950/40"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <h3
          className={`text-[11px] font-semibold uppercase tracking-wide ${
            active ? "text-zinc-700 dark:text-zinc-200" : "text-zinc-400 dark:text-zinc-500"
          }`}
        >
          {title}
        </h3>
        {badge}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

/**
 * Escolha entre opções mutuamente exclusivas onde a seleção precisa ficar
 * óbvia — um `<select>` some no meio do formulário quando a decisão é
 * estruturante, como "qual IA de fato roda a análise".
 */
export function ChoiceField({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; description?: string; warning?: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {hint && <span className="text-xs leading-relaxed text-zinc-400">{hint}</span>}
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`rounded-lg border-2 px-4 py-3 text-left transition ${
                selected
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{o.label}</span>
                {selected && (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide dark:bg-zinc-900/15">
                    em uso
                  </span>
                )}
              </div>
              {o.description && (
                <p
                  className={`mt-0.5 text-xs ${
                    selected ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-400"
                  }`}
                >
                  {o.description}
                </p>
              )}
              {o.warning && (
                <p
                  className={`mt-1 text-xs font-medium ${
                    selected ? "text-amber-300 dark:text-amber-700" : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {o.warning}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-800 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-800"
      />
      {hint && <span className="text-xs leading-relaxed text-zinc-400">{hint}</span>}
    </label>
  );
}

/**
 * Campo de texto longo pra conteúdo colado (skill, procedimento). Monoespaçado
 * porque o que entra aqui é markdown/passo a passo e o alinhamento importa na
 * hora de conferir o que foi colado.
 */
export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  rows = 14,
  maxChars,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
  /** Só informativo: quem barra de verdade é o backend. */
  maxChars?: number;
}) {
  const over = maxChars !== undefined && value.length > maxChars;

  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {hint && <span className="text-xs leading-relaxed text-zinc-400">{hint}</span>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        spellCheck={false}
        className={`resize-y rounded-lg border bg-white px-3.5 py-2.5 font-mono text-xs leading-relaxed text-zinc-800 outline-none transition focus:ring-2 dark:bg-zinc-950 dark:text-zinc-100 ${
          over
            ? "border-red-400 focus:border-red-500 focus:ring-red-100 dark:border-red-800 dark:focus:ring-red-950"
            : "border-zinc-300 focus:border-zinc-500 focus:ring-zinc-100 dark:border-zinc-700 dark:focus:ring-zinc-800"
        }`}
      />
      {maxChars !== undefined && (
        <span
          className={`self-end text-[11px] tabular-nums ${
            over ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-400"
          }`}
        >
          {value.length.toLocaleString("pt-BR")} / {maxChars.toLocaleString("pt-BR")} caracteres
          {over && " — o backend vai recusar"}
        </span>
      )}
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-800 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-zinc-800"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SaveBar({
  saving,
  saved,
  error,
  onSave,
}: {
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {saving ? (
          <LuLoaderCircle className="size-4 animate-spin" />
        ) : (
          <LuCheck className="size-4" />
        )}
        Salvar
      </button>
      {saved && !saving && (
        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Salvo com sucesso.
        </span>
      )}
      {error && (
        <span className="text-xs font-medium text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  );
}
