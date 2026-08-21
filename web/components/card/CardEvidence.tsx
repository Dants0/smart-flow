"use client";

import { useState } from "react";
import Image from "next/image";
import {
  LuCrosshair,
  LuListChecks,
  LuActivity,
  LuFileText,
  LuTriangleAlert,
  LuChevronDown,
  LuChevronRight,
  LuBot,
  LuUser,
  LuX,
  LuLightbulb,
} from "react-icons/lu";
import type { Card } from "@/lib/types";
import { cardImageSrc } from "@/lib/image";
import { timeAgo } from "@/lib/time";

const CONFIDENCE_LABEL: Record<string, string> = {
  baixa: "confiança baixa",
  media: "confiança média",
  alta: "confiança alta",
};

/**
 * Coluna de apoio da revisão: de onde a proposta saiu.
 *
 * Fica ao lado do plano de mudança, não antes dele. Na versão anterior o dev
 * rolava chamado → análise → raciocínio → objetos → histórico **antes** de
 * chegar no diff; aqui o diff é o assunto principal e isto é a evidência que
 * sustenta, aberta quando ele quiser conferir.
 */
function Block({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
      >
        {open ? (
          <LuChevronDown className="size-4 shrink-0 text-zinc-400" />
        ) : (
          <LuChevronRight className="size-4 shrink-0 text-zinc-400" />
        )}
        <Icon className="size-4 shrink-0 text-zinc-400" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {title}
        </span>
        {badge}
      </button>
      {open && <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">{children}</div>}
    </section>
  );
}

export function CardEvidence({ card }: { card: Card }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <Block title="Chamado" icon={LuFileText} defaultOpen>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {card.rawTicket}
        </p>

        {!!card.images?.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {card.images.map((img, i) => (
              <Image
                key={i}
                src={cardImageSrc(img)}
                alt={img.name}
                width={96}
                height={96}
                unoptimized
                onClick={() => setLightbox(cardImageSrc(img))}
                className="size-24 cursor-zoom-in rounded-md border border-zinc-200 object-cover transition hover:opacity-80 dark:border-zinc-700"
              />
            ))}
          </div>
        )}

        {!!card.traceFiles?.length && (
          <div className="mt-2 flex flex-wrap gap-2">
            {card.traceFiles.map((tf, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
              >
                <LuFileText className="size-3.5 text-zinc-400" />
                {tf.name}
              </span>
            ))}
          </div>
        )}
      </Block>

      {/*
        Aparece logo depois do chamado e antes da análise: é o que o dev sabia
        antes de a IA opinar, e explica por que ela foi por aquele caminho.
      */}
      {card.devHints?.trim() && (
        <Block title="Direcionamento do dev" icon={LuLightbulb} defaultOpen>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {card.devHints}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
            Escrito na criação do card. A IA trata como evidência e usa os objetos citados para
            abrir o código correspondente.
          </p>
        </Block>
      )}

      {card.analysis && (
        <Block
          title="Causa raiz"
          icon={LuCrosshair}
          defaultOpen
          badge={
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {CONFIDENCE_LABEL[card.analysis.confidence]}
            </span>
          }
        >
          {card.grounded === false && (
            <p className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <LuTriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong>Análise sem contexto de código.</strong> O PB Insight não retornou
                trecho nenhum — os objetos citados podem não existir.
              </span>
            </p>
          )}
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {card.analysis.rootCause}
          </p>
          {card.analysis.needsTrace && (
            <p className="mt-2 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
              Um pbtrace deixaria esta análise mais firme — anexe e reprocesse se o cenário
              permitir.
            </p>
          )}
        </Block>
      )}

      {!!card.analysis?.reasoning.length && (
        <Block title="Raciocínio" icon={LuListChecks}>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {card.analysis.reasoning.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </Block>
      )}

      {!!card.analysis?.affectedObjects.length && (
        <Block
          title="Objetos apontados"
          icon={LuCrosshair}
          badge={
            <span className="text-[10px] text-zinc-400">
              {card.analysis.affectedObjects.length}
            </span>
          }
        >
          <div className="flex flex-col gap-2">
            {card.analysis.affectedObjects.map((obj, i) => (
              <div key={i} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                    {obj.name}
                  </span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                    {obj.type}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{obj.reason}</p>
              </div>
            ))}
          </div>
        </Block>
      )}

      {!!card.traceAnalysis?.length && (
        <Block title="Diagnóstico de trace" icon={LuActivity}>
          <div className="flex flex-col gap-2">
            {card.traceAnalysis.map((t, i) => (
              <div key={i}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {t.filename}
                  </span>
                  <span className="text-[10px] text-zinc-400">{t.eventCount} eventos</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {t.strategicAnalysis}
                </p>
              </div>
            ))}
          </div>
        </Block>
      )}

      <Block
        title="Histórico"
        icon={LuListChecks}
        badge={<span className="text-[10px] text-zinc-400">{card.history.length}</span>}
      >
        <ol className="space-y-2">
          {card.history.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              {h.by === "IA" ? (
                <LuBot className="mt-0.5 size-3.5 shrink-0 text-blue-500" />
              ) : (
                <LuUser className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
              )}
              <span className="text-zinc-500">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {h.from} → {h.to}
                </span>{" "}
                {h.userName && (
                  <span className="text-zinc-600 dark:text-zinc-400">por {h.userName} </span>
                )}
                · {timeAgo(h.at)}
                {h.note ? ` · ${h.note}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </Block>

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[60] flex cursor-zoom-out items-center justify-center bg-black/80 p-8"
        >
          <div className="relative h-[85vh] w-[85vw]">
            <Image
              src={lightbox}
              alt="screenshot em tamanho maior"
              fill
              unoptimized
              className="rounded-lg object-contain shadow-2xl"
            />
          </div>
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <LuX className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
