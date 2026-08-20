"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  LuX,
  LuListChecks,
  LuCrosshair,
  LuFlaskConical,
  LuTriangleAlert,
  LuBot,
  LuUser,
  LuActivity,
  LuFileText,
} from "react-icons/lu";
import type { Card } from "@/lib/types";
import { timeAgo } from "@/lib/time";
import { cardImageSrc } from "@/lib/image";
import { DiffView } from "../DiffView";

const CONFIDENCE_LABEL: Record<string, string> = {
  baixa: "confiança baixa",
  media: "confiança média",
  alta: "confiança alta",
};

/**
 * Conteúdo do card — chamado, trace, análise, proposta e histórico.
 *
 * Vive separado do painel lateral porque é exibido em dois lugares: na gaveta do
 * board (estreita, pra dar uma olhada sem sair do fluxo) e na página inteira do
 * card (larga, pra ler o chamado com calma). Duplicar isso garantiria que as
 * duas telas divergissem na primeira mudança.
 */
export function CardContent({ card }: { card: Card }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  /**
   * Esc fecha o screenshot ampliado — e só ele. Registrado na fase de captura
   * com `stopPropagation` pra vencer o Esc do painel lateral, que fica logo
   * atrás: sem isso, fechar a imagem fecharia o card junto.
   */
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setLightbox(null);
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [lightbox]);

  return (
    <>
      {/* ticket bruto */}
      <section className="mb-5">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Chamado
        </h3>
        <p className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          {card.rawTicket}
        </p>

        {!!card.images?.length && (
          <div className="mt-2 flex flex-wrap gap-2">
            {card.images.map((img, i) => (
              <Image
                key={i}
                src={cardImageSrc(img)}
                alt={img.name}
                width={80}
                height={80}
                unoptimized
                onClick={() => setLightbox(cardImageSrc(img))}
                className="size-20 cursor-zoom-in rounded-md border border-zinc-200 object-cover transition hover:opacity-80 dark:border-zinc-700"
              />
            ))}
          </div>
        )}

        {!!card.traceFiles?.length && (
          <div className="mt-2 flex flex-wrap gap-2">
            {card.traceFiles.map((tf, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <LuFileText className="size-3.5 text-zinc-400" />
                {tf.name}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* diagnóstico do app_trace */}
      {!!card.traceAnalysis?.length && (
        <section className="mb-5">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <LuActivity className="size-3.5" />
            Diagnóstico de trace (app_trace)
          </h3>
          <div className="flex flex-col gap-2">
            {card.traceAnalysis.map((t, i) => (
              <div
                key={i}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    {t.filename}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {t.eventCount} eventos
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                  {t.strategicAnalysis}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* erro */}
      {card.stage === "ERRO" && (
        <section className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          <LuTriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {card.history[card.history.length - 1]?.note ??
              "Falha desconhecida no processamento."}
          </span>
        </section>
      )}

      {/* análise */}
      {card.analysis && (
        <section className="mb-5">
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Análise (IA)
            </h3>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {CONFIDENCE_LABEL[card.analysis.confidence]}
            </span>
          </div>

          {/* Sem isto, uma análise sem código real soa tão confiante quanto uma com. */}
          {card.grounded === false && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <LuTriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong>Análise sem contexto de código.</strong> O PB Insight não
                retornou nenhum trecho do codebase — os objetos citados abaixo podem
                não existir. Suba o serviço e reprocesse antes de confiar no diff.
              </span>
            </div>
          )}

          <div className="mb-3 flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <LuCrosshair className="mt-0.5 size-4 shrink-0 text-blue-500" />
            <p className="font-medium">{card.analysis.rootCause}</p>
          </div>

          {card.analysis.reasoning.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                <LuListChecks className="size-3.5" />
                Raciocínio
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                {card.analysis.reasoning.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {card.analysis.affectedObjects.length > 0 && (
            <div className="mb-1">
              <div className="mb-1 text-xs font-medium text-zinc-500">
                Objetos afetados
              </div>
              <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                {card.analysis.affectedObjects.map((obj, i) => (
                  <div
                    key={i}
                    className="border-b border-zinc-100 px-3 py-2 text-sm last:border-0 dark:border-zinc-800"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                        {obj.name}
                      </span>
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
                        {obj.type}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {obj.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {card.analysis.needsTrace && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Esta análise pede um pbtrace antes de propor o diff.
            </p>
          )}
        </section>
      )}

      {/* proposta */}
      {card.proposal && (
        <section className="mb-5">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Proposta (IA)
          </h3>
          <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {card.proposal.summary}
          </p>

          <DiffView diff={card.proposal.diff} />

          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-medium text-zinc-500">Justificativa: </span>
            {card.proposal.rationale}
          </p>

          {card.proposal.risks.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <LuTriangleAlert className="size-3.5" />
                Riscos
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                {card.proposal.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-2 flex items-start gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <LuFlaskConical className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
            <span>
              <span className="font-medium text-zinc-500">Como testar: </span>
              {card.proposal.testHint}
            </span>
          </div>
        </section>
      )}

      {/* histórico */}
      <section>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Histórico
        </h3>
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
                {/* qual dev, não só "um dev" — rastreabilidade real num time */}
                {h.userName && <span className="text-zinc-600 dark:text-zinc-400">por {h.userName} </span>}
                · {timeAgo(h.at)}
                {h.note ? ` · ${h.note}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>

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
    </>
  );
}
