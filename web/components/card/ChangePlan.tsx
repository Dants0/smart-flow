"use client";

import { useState } from "react";
import {
  LuFileCode,
  LuChevronDown,
  LuChevronRight,
  LuTriangleAlert,
  LuFlaskConical,
  LuCircleCheckBig,
  LuSearch,
} from "react-icons/lu";
import type { Card } from "@/lib/types";
import { parseDiff, fileDir, fileName } from "@/lib/diff";
import { DiffView } from "../DiffView";

/**
 * O bloco central da revisão: **onde** muda e **o que** muda.
 *
 * A versão anterior desta tela era um scroll único (chamado → análise →
 * raciocínio → objetos → histórico) em que o diff aparecia no meio, sem dizer
 * quantos arquivos eram nem quais. Aqui os arquivos vêm primeiro, em lista, com
 * contagem de linhas e as faixas de linha alteradas — e o diff de cada um abre
 * embaixo do respectivo arquivo, não num bloco só.
 */
export function ChangePlan({ card }: { card: Card }) {
  const files = card.proposal?.diff ? parseDiff(card.proposal.diff) : [];
  // Um arquivo só: já abre. Vários: o dev escolhe por onde começar.
  const [open, setOpen] = useState<Set<string>>(
    new Set(files.length === 1 ? [files[0].path] : []),
  );

  function toggle(path: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  if (!card.proposal) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-400 dark:border-zinc-700">
        Ainda não há proposta de correção para este card.
      </p>
    );
  }

  /*
   * Sem diff, isto não é um plano de mudança — é um pedido de investigação.
   * Mostrar "Onde muda: 0 arquivo(s) · +0 −0" com um parágrafo enorme ao lado
   * era o pior dos dois mundos: parecia proposta e não dizia o que fazer.
   */
  if (files.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <h2 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            <LuSearch className="size-3.5" />
            Falta material para propor o diff
          </h2>
          <p className="text-base font-medium leading-relaxed text-amber-900 dark:text-amber-200">
            {card.proposal.summary}
          </p>
        </div>

        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            O que investigar
          </h3>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {card.proposal.rationale}
          </p>
        </section>

        {card.proposal.testHint && (
          <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <LuFlaskConical className="size-3.5" />
              Como confirmar
            </h3>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {card.proposal.testHint}
            </p>
          </section>
        )}

        <p className="text-xs leading-relaxed text-zinc-400">
          Anexe o que falta ao chamado (ou aponte o objeto certo na aba Perguntar) e use
          &quot;Rejeitar, pedir nova proposta&quot; — a próxima rodada volta com o material novo.
        </p>
      </div>
    );
  }

  const totalAdded = files.reduce((sum, f) => sum + f.added, 0);
  const totalRemoved = files.reduce((sum, f) => sum + f.removed, 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          O que muda
        </h2>
        <p className="mt-1 text-base font-medium leading-relaxed text-zinc-800 dark:text-zinc-100">
          {card.proposal.summary}
        </p>
      </div>

      {/* Aviso de caminho inventado vem antes de tudo: muda como se lê o resto. */}
      {!!card.unknownPaths?.length && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs leading-relaxed text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Esta proposta cita arquivos que não existem no repositório.</strong> Trate o
            diff como hipótese, não como correção.
            <ul className="mt-1 space-y-0.5 font-mono">
              {card.unknownPaths.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </span>
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Onde muda
          </h2>
          <span className="font-mono text-[11px] text-zinc-400">
            {files.length} arquivo(s) ·{" "}
            <span className="text-emerald-600 dark:text-emerald-400">+{totalAdded}</span>{" "}
            <span className="text-red-600 dark:text-red-400">−{totalRemoved}</span>
          </span>
        </div>

        <ul className="flex flex-col gap-2">
          {files.map((file) => {
            const isOpen = open.has(file.path);
            return (
              <li
                key={file.path || "sem-arquivo"}
                className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
              >
                <button
                  onClick={() => toggle(file.path)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 bg-zinc-50 px-3 py-2.5 text-left transition hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                >
                  {isOpen ? (
                    <LuChevronDown className="size-4 shrink-0 text-zinc-400" />
                  ) : (
                    <LuChevronRight className="size-4 shrink-0 text-zinc-400" />
                  )}
                  <LuFileCode className="size-4 shrink-0 text-zinc-400" />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      {fileName(file.path) || "(diff sem nome de arquivo)"}
                    </span>
                    {/* a pasta importa: é o que distingue objetos de nome parecido */}
                    <span className="block truncate font-mono text-[11px] text-zinc-400">
                      {fileDir(file.path)}
                    </span>
                  </span>

                  <span className="shrink-0 font-mono text-[11px]">
                    <span className="text-emerald-600 dark:text-emerald-400">+{file.added}</span>{" "}
                    <span className="text-red-600 dark:text-red-400">−{file.removed}</span>
                  </span>
                </button>

                {/* Faixas de linha: onde exatamente, sem precisar abrir o diff. */}
                {file.hunks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 px-3 py-1.5 dark:border-zinc-800">
                    {file.hunks.map((h, i) => (
                      <span
                        key={i}
                        className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      >
                        {h.startLine !== null ? `linha ${h.startLine}` : h.header.slice(0, 24)}
                      </span>
                    ))}
                  </div>
                )}

                {isOpen && (
                  <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
                    <DiffView diff={file.raw} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Por que
          </h3>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {card.proposal.rationale}
          </p>
        </section>

        <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <LuFlaskConical className="size-3.5" />
            Como testar
          </h3>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {card.proposal.testHint}
          </p>
        </section>
      </div>

      {card.proposal.risks.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            <LuTriangleAlert className="size-3.5" />
            Riscos
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
            {card.proposal.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      {card.appliedAt && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <LuCircleCheckBig className="size-3.5" />
          Diff já aplicado no working copy ({card.appliedFiles?.length ?? 0} arquivo(s)).
        </p>
      )}
    </div>
  );
}
