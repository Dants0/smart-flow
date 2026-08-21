"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LuX, LuLoaderCircle, LuSparkles, LuImagePlus, LuFileUp, LuKeyRound, LuDownload } from "react-icons/lu";
import { SiJira } from "react-icons/si";
import { createCard, fetchJiraIssue } from "@/lib/api";
import type { Card, CardImage, CardTraceFile } from "@/lib/types";
import { cardImageSrc, filesToCardImages, MAX_IMAGES } from "@/lib/image";
import { filesToTraceFiles, MAX_TRACE_FILES } from "@/lib/traceFile";
import { loadTraceProviderSettings, PROVIDER_LABEL } from "@/lib/settings";
import { SYSTEMS } from "@/lib/systems";

export function NewCardModal({
  onClose,
  onCreated,
  onError,
  initialJiraKey,
}: {
  onClose: () => void;
  onCreated: (card: Card) => void;
  onError: (message: string) => void;
  initialJiraKey?: string;
}) {
  const [jiraKey, setJiraKey] = useState(initialJiraKey ?? "");
  const [module, setModule] = useState<string>(SYSTEMS[0].value);
  const [rawTicket, setRawTicket] = useState("");
  const [devHints, setDevHints] = useState("");
  const [images, setImages] = useState<CardImage[]>([]);
  const [traceFiles, setTraceFiles] = useState<CardTraceFile[]>([]);
  const [jiraFetching, setJiraFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const traceInputRef = useRef<HTMLInputElement>(null);
  const [traceSettings] = useState(() => loadTraceProviderSettings());
  const submittedRef = useRef(false);

  async function handleFetchFromJira(key = jiraKey) {
    if (!key.trim()) return;
    setJiraFetching(true);
    setError(null);
    try {
      const preview = await fetchJiraIssue(key.trim());
      setRawTicket(preview.rawTicket);
      setImages((prev) => [...prev, ...preview.images.slice(0, Math.max(0, MAX_IMAGES - prev.length))]);
      setTraceFiles((prev) => [
        ...prev,
        ...preview.traceFiles.slice(0, Math.max(0, MAX_TRACE_FILES - prev.length)),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao buscar do Jira");
    } finally {
      setJiraFetching(false);
    }
  }

  useEffect(() => {
    if (initialJiraKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- veio de um chamado atribuído detectado no Jira; busca automática só acontece uma vez, no mount
      handleFetchFromJira(initialJiraKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só dispara uma vez, no mount
  }, []);

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    const { images: next, skipped } = await filesToCardImages(files, images);
    setImages(next);
    if (skipped > 0) {
      setError(
        `${skipped} imagem(ns) ignorada(s) — máximo de ${MAX_IMAGES} anexos, até 5MB cada.`,
      );
    }
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function addTraceFiles(files: File[]) {
    if (files.length === 0) return;
    const { traceFiles: next, skipped } = await filesToTraceFiles(files, traceFiles);
    setTraceFiles(next);
    if (skipped > 0) {
      setError(
        `${skipped} arquivo(s) de trace ignorado(s) — máximo de ${MAX_TRACE_FILES} anexos, até 8MB cada.`,
      );
    }
  }

  function removeTraceFile(index: number) {
    setTraceFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...e.clipboardData.items]
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }

  // Não espera o pipeline de IA (ANALISE -> DESENVOLVIMENTO) terminar: fecha o modal
  // na hora e deixa o card aparecer/progredir no board via polling. Erros de criação
  // (ex: falha de rede) chegam via onError, já que o modal não existe mais pra mostrá-los.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittedRef.current || !jiraKey.trim() || !rawTicket.trim()) return;
    submittedRef.current = true;

    const traceProvider = traceSettings
      ? {
          modelAi: traceSettings.model,
          apiKey: traceSettings.apiKey,
          ...(traceSettings.azureEndpoint ? { azureEndpoint: traceSettings.azureEndpoint } : {}),
        }
      : undefined;

    createCard({
      jiraKey,
      module,
      rawTicket,
      devHints: devHints.trim() || undefined,
      images,
      traceFiles,
      traceProvider,
    })
      .then(onCreated)
      .catch((err) => onError(err instanceof Error ? err.message : "falha ao criar card"));

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Novo card
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <LuX className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-zinc-500">
              Chamado Jira
              <div className="flex gap-1.5">
                <input
                  value={jiraKey}
                  onChange={(e) => setJiraKey(e.target.value)}
                  placeholder="SMART-12345"
                  required
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => handleFetchFromJira()}
                  disabled={!jiraKey.trim() || jiraFetching}
                  title="Buscar texto e anexos do Jira"
                  className="flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {jiraFetching ? (
                    <LuLoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <SiJira className="size-3.5" />
                  )}
                  <LuDownload className="size-3" />
                </button>
              </div>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
              Sistema
              <select
                value={module}
                onChange={(e) => setModule(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {SYSTEMS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              {/* o módulo (ATENDE, AGENDA...) não é escolhido aqui: quem identifica é a análise */}
              <span className="text-[11px] font-normal leading-relaxed text-zinc-400">
                {SYSTEMS.find((s) => s.value === module)?.hint}
              </span>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            Texto bruto do chamado
            <textarea
              value={rawTicket}
              onChange={(e) => setRawTicket(e.target.value)}
              onPaste={handlePaste}
              placeholder="Cole aqui o texto do chamado do Jira... (dá pra colar prints com Ctrl+V também)"
              required
              rows={7}
              className="resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>

          {/*
            O que o dev já sabe. É a única parte do prompt escrita por alguém com
            o sistema na frente — e além de ir pro texto, direciona a BUSCA: citar
            `d_agm09tab` faz a plataforma abrir esse objeto no repositório.
          */}
          <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
            O que você já sabe <span className="font-normal text-zinc-400">(opcional)</span>
            <textarea
              value={devHints}
              onChange={(e) => setDevHints(e.target.value)}
              placeholder={
                "Direcione a análise: objeto suspeito, DataWindow, query, o que já foi descartado.\n\n" +
                "Ex: acho que é a d_agm09tab — o WHERE não amarra a OS.\n" +
                "Ex: SELECT ... FROM pac WHERE pac_reg = :nPacReg retorna 2 linhas na base do cliente.\n" +
                "Ex: já conferi o INI CON_MED_FL, está como 'S'."
              }
              rows={4}
              className="resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <span className="font-normal leading-relaxed text-zinc-400">
              A IA trata isto como <strong>evidência</strong>, não palpite — e usa os nomes que
              você citar para abrir esses objetos no repositório.
            </span>
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">
                Screenshots ({images.length}/{MAX_IMAGES})
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={images.length >= MAX_IMAGES}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                <LuImagePlus className="size-3.5" />
                Anexar imagem
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  addFiles([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
            </div>

            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <div key={i} className="group relative size-16 shrink-0">
                    <Image
                      src={cardImageSrc(img)}
                      alt={img.name}
                      width={64}
                      height={64}
                      unoptimized
                      className="size-16 rounded-md border border-zinc-200 object-cover dark:border-zinc-700"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-zinc-900 text-white opacity-0 transition group-hover:opacity-100"
                    >
                      <LuX className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">
                Trace ({traceFiles.length}/{MAX_TRACE_FILES})
              </span>
              <button
                type="button"
                onClick={() => traceInputRef.current?.click()}
                disabled={traceFiles.length >= MAX_TRACE_FILES}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                <LuFileUp className="size-3.5" />
                Anexar log de trace
              </button>
              <input
                ref={traceInputRef}
                type="file"
                accept=".log,.txt,text/plain"
                multiple
                hidden
                onChange={(e) => {
                  addTraceFiles([...(e.target.files ?? [])]);
                  e.target.value = "";
                }}
              />
            </div>

            {traceFiles.length > 0 && (
              <ul className="flex flex-col gap-1">
                {traceFiles.map((tf, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    <span className="truncate font-mono">{tf.name}</span>
                    <button
                      type="button"
                      onClick={() => removeTraceFile(i)}
                      className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      <LuX className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {traceFiles.length > 0 && (
              <p className="flex items-center gap-1 text-[11px] text-zinc-400">
                <LuKeyRound className="size-3" />
                {traceSettings
                  ? `Vai usar sua chave pessoal (${PROVIDER_LABEL[traceSettings.provider]}, ${traceSettings.model}).`
                  : "Sem chave pessoal configurada — vai usar o token corporativo (Anthropic)."}
              </p>
            )}
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              <LuSparkles className="size-4" />
              Criar e disparar IA
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
