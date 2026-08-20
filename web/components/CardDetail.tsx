"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LuX, LuLoaderCircle, LuTrash2, LuCheck, LuMaximize2 } from "react-icons/lu";
import type { Card } from "@/lib/types";
import { STAGE_META } from "@/lib/stageMeta";
import { deleteCard } from "@/lib/api";
import { systemLabel } from "@/lib/systems";
import { CardContent } from "./card/CardContent";
import { CardActions } from "./card/CardActions";

/**
 * Painel lateral do board — a olhada rápida, sem sair do fluxo. O conteúdo e as
 * ações são os mesmos da página inteira do card (`/cards/[id]`), por isso vivem
 * em componentes compartilhados.
 */
export function CardDetail({
  card,
  onClose,
  onUpdated,
  onDeleted,
}: {
  card: Card;
  onClose: () => void;
  onUpdated: (card: Card) => void;
  onDeleted: (id: string) => void;
}) {
  const meta = STAGE_META[card.stage];
  const Icon = meta.icon;

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Esc fecha o painel. A ordem importa: se há uma confirmação de apagar em
   * aberto, Esc cancela ela primeiro — fechar o painel inteiro faria o dev
   * perder de vista o que estava prestes a confirmar.
   *
   * O lightbox de screenshot tem o próprio Esc (dentro do CardContent) e usa
   * `stopPropagation`, então não colide com este.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmingDelete) {
        setConfirmingDelete(false);
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, confirmingDelete]);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteCard(card.id);
      onDeleted(card.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao apagar card");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-zinc-950">
        {/* header */}
        <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <div className="mb-1 flex items-center gap-2">
              {/*
                O número abre o chamado inteiro numa aba nova: o painel tem 36rem
                e chamado com print, trace e diff não cabe aqui sem virar rolagem
                infinita.
              */}
              <Link
                href={`/cards/${card.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir o chamado inteiro numa nova aba"
                className="group flex items-center gap-1.5 font-mono text-sm font-semibold text-zinc-800 underline-offset-4 hover:underline dark:text-zinc-100"
              >
                {card.jiraKey}
                <LuMaximize2 className="size-3.5 text-zinc-400 transition group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
              </Link>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                {systemLabel(card.module)}
              </span>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.chip}`}
            >
              <Icon className="size-3.5" />
              {meta.label}
            </span>
          </div>

          {confirmingDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-red-600 dark:text-red-400">Apagar de vez?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? (
                  <LuLoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <LuCheck className="size-3.5" />
                )}
                Apagar
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setConfirmingDelete(true)}
                title="Apagar card"
                className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
              >
                <LuTrash2 className="size-4" />
              </button>
              <button
                onClick={onClose}
                title="Fechar (Esc)"
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
              >
                <LuX className="size-5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <CardContent card={card} />
          {error && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
        </div>

        <CardActions card={card} onUpdated={onUpdated} />
      </div>
    </div>
  );
}
