"use client";

import { LuSearch, LuX } from "react-icons/lu";
import type { CardFilters } from "@/lib/api";
import { systemLabel } from "@/lib/systems";

/** Janelas pra coluna RESOLVIDO, que cresce indefinidamente. */
const WINDOWS = [
  { value: 7, label: "Resolvidos: 7 dias" },
  { value: 30, label: "Resolvidos: 30 dias" },
  { value: 0, label: "Resolvidos: todos" },
];

export function BoardFilters({
  filters,
  modules,
  onChange,
}: {
  filters: CardFilters;
  modules: string[];
  onChange: (next: CardFilters) => void;
}) {
  const active = !!(filters.search || filters.module || filters.mine);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-6 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="relative flex-1 sm:max-w-xs">
        <LuSearch className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          value={filters.search ?? ""}
          onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
          placeholder="Buscar por chamado, texto ou solução..."
          className="w-full rounded-md border border-zinc-300 py-1.5 pl-8 pr-3 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      <select
        value={filters.module ?? ""}
        onChange={(e) => onChange({ ...filters, module: e.target.value || undefined })}
        className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-700 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      >
        <option value="">Todos os sistemas</option>
        {modules.map((m) => (
          <option key={m} value={m}>
            {systemLabel(m)}
          </option>
        ))}
      </select>

      <select
        value={String(filters.resolvedWithinDays ?? 0)}
        onChange={(e) => {
          const days = Number(e.target.value);
          onChange({ ...filters, resolvedWithinDays: days > 0 ? days : undefined });
        }}
        className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-700 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      >
        {WINDOWS.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>

      <button
        onClick={() => onChange({ ...filters, mine: filters.mine ? undefined : true })}
        className={`rounded-md border px-2.5 py-1.5 text-sm font-medium transition ${
          filters.mine
            ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
            : "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        }`}
      >
        Meus cards
      </button>

      {active && (
        <button
          onClick={() =>
            onChange({ resolvedWithinDays: filters.resolvedWithinDays })
          }
          title="Limpar filtros"
          className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <LuX className="size-3.5" />
          Limpar
        </button>
      )}
    </div>
  );
}
