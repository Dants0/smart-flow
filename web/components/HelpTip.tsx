"use client";

import { useEffect, useRef, useState } from "react";
import { LuCircleHelp, LuX } from "react-icons/lu";

/**
 * Botão de "?" com um painel de ajuda ao lado.
 *
 * Existe porque instrução que só aparece quando o erro acontece chega tarde: o
 * dev que está apanhando pra conectar precisa achar o passo a passo NA TELA
 * onde ele mexe na configuração, sem depender de alguém que já passou por isso.
 */
export function HelpTip({
  label,
  title,
  children,
}: {
  /** Descrição pra leitor de tela — o ícone sozinho não diz do que é a ajuda. */
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha com Esc e ao clicar fora: painel preso na tela atrapalha mais do que ajuda.
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition ${
          open
            ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
            : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        }`}
      >
        <LuCircleHelp className="size-3.5" />
        Ajuda
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-20 w-[min(30rem,calc(100vw-3rem))] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-2 flex items-start justify-between gap-3">
            <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{title}</h4>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar ajuda"
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
            >
              <LuX className="size-3.5" />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
