"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LuGitCommitHorizontal,
  LuGitPullRequest,
  LuLoaderCircle,
  LuTriangleAlert,
  LuCircleCheckBig,
  LuExternalLink,
  LuMessageSquarePlus,
  LuRefreshCw,
} from "react-icons/lu";
import {
  commitCard,
  getJiraCommentDraft,
  getVersioningPreview,
  openPullRequest,
  postJiraComment,
  type VersioningPreview,
} from "@/lib/api";
import type { Card } from "@/lib/types";

/**
 * Etapa de versionamento: commit → push + PR → comentário no Jira.
 *
 * A tela existe para o dev **ver o que vai subir** antes de clicar. É resposta
 * direta a um risco real: quem só vai aceitando telas acaba commitando o que não
 * queria. Por isso:
 *
 *  - a lista mostra cada arquivo, seu status no git e sua classificação;
 *  - artefato de build (`.pbl`, `.pbw`, `.pbd`) aparece bloqueado, sem checkbox;
 *  - arquivo fora do padrão (`outro`) entra **desmarcado**, com aviso — é o
 *    "artefato estranho" que o dev precisa olhar antes de decidir;
 *  - o que está sujo na árvore mas não é da correção nem aparece como opção.
 */
export function VersioningPanel({
  card,
  onUpdated,
}: {
  card: Card;
  onUpdated: (card: Card) => void;
}) {
  const [preview, setPreview] = useState<VersioningPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "commit" | "pr" | "comment">(null);
  const [error, setError] = useState<string | null>(null);
  // já commitado: não há retrato a carregar, o painel mostra o que aconteceu
  const [loading, setLoading] = useState(!card.commitHash);

  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getVersioningPreview(card.id);
      setPreview(data);
      setSelected(new Set(data.files.filter((f) => f.autoSelect).map((f) => f.path)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao ler o repositório");
    } finally {
      setLoading(false);
    }
  }, [card.id]);

  useEffect(() => {
    if (card.commitHash) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura do repositório ao abrir o painel
    load();
  }, [load, card.commitHash]);

  async function run(action: "commit" | "pr" | "comment", fn: () => Promise<Card>) {
    setBusy(action);
    setError(null);
    try {
      onUpdated(await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha na ação");
    } finally {
      setBusy(null);
    }
  }

  async function loadComment() {
    setShowComment(true);
    if (comment) return;
    try {
      setComment((await getJiraCommentDraft(card.id)).body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao montar o comentário");
    }
  }

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  // ---- já commitado: push, PR e comentário ---------------------------------
  if (card.commitHash) {
    return (
      <div className="flex flex-col gap-3 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs leading-relaxed text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
          <p className="flex items-center gap-1.5 font-medium">
            <LuGitCommitHorizontal className="size-3.5" />
            Commit {card.commitHash.slice(0, 8)} em {card.branch}
          </p>
          <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
            {card.committedFiles?.map((f) => (
              <li key={f} className="truncate" title={f}>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {card.prUrl ? (
          <a
            href={card.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <LuCircleCheckBig className="size-4" />
            Pull request aberto
            <LuExternalLink className="size-3.5" />
          </a>
        ) : (
          <button
            onClick={() => run("pr", () => openPullRequest(card.id))}
            disabled={busy !== null}
            className="flex items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {busy === "pr" ? (
              <LuLoaderCircle className="size-4 animate-spin" />
            ) : (
              <LuGitPullRequest className="size-4" />
            )}
            Push da branch e abrir PR
          </button>
        )}

        {/* Comentário no Jira: registro oficial de entrega, sempre revisado antes. */}
        {card.jiraCommentAt ? (
          <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <LuCircleCheckBig className="size-3.5" />
            Comentário publicado no {card.jiraKey}
          </p>
        ) : showComment ? (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Comentário de entrega — revise antes de publicar
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={14}
              className="resize-y rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
              <strong>EVIDÊNCIAS</strong> fica em branco de propósito: é prova de teste, e a
              plataforma não testou nada. Preencha antes de publicar.
            </p>
            <button
              onClick={() => run("comment", () => postJiraComment(card.id, comment))}
              disabled={busy !== null || !comment.trim()}
              className="flex items-center justify-center gap-1.5 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
            >
              {busy === "comment" ? (
                <LuLoaderCircle className="size-4 animate-spin" />
              ) : (
                <LuMessageSquarePlus className="size-4" />
              )}
              Publicar no {card.jiraKey}
            </button>
          </div>
        ) : (
          <button
            onClick={loadComment}
            className="flex items-center justify-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <LuMessageSquarePlus className="size-4" />
            Montar comentário de entrega
          </button>
        )}

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  // ---- antes do commit: o retrato do que vai subir --------------------------
  return (
    <div className="flex flex-col gap-3 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Versionamento
        </h4>
        <button
          onClick={load}
          disabled={loading}
          title="Reler o repositório"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
        >
          <LuRefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          Reler
        </button>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-xs text-zinc-400">
          <LuLoaderCircle className="size-3.5 animate-spin" />
          Lendo o repositório...
        </p>
      )}

      {preview && (
        <>
          {/* Branch errada é o erro mais caro aqui: commit no lugar errado. */}
          {preview.onExpectedBranch ? (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <LuCircleCheckBig className="size-3.5" />
              Na branch {preview.currentBranch}
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <LuTriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                O working copy está em <strong>{preview.currentBranch || "(sem branch)"}</strong>,
                e o esperado para este chamado é <strong>{preview.expectedBranch}</strong>. Troque
                de branch você mesmo — a plataforma não troca, porque a árvore tem alterações suas.
              </span>
            </p>
          )}

          <ul className="flex flex-col gap-1">
            {preview.files.map((f) => {
              const blocked = f.kind === "proibido";
              const unusual = f.kind === "outro";
              return (
                <li
                  key={f.path}
                  className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs ${
                    blocked
                      ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                      : unusual
                        ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
                        : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(f.path)}
                    disabled={blocked}
                    onChange={() => toggle(f.path)}
                    className="mt-0.5 size-3.5 shrink-0 accent-zinc-900 disabled:opacity-40 dark:accent-white"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-zinc-700 dark:text-zinc-300" title={f.path}>
                      {f.path}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {f.status}
                      {blocked && " · artefato de build — nunca sobe"}
                      {unusual && " · fora do padrão (.sru/.sra/.srd/.srw) — confira antes de marcar"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          {preview.otherDirtyCount > 0 && (
            <p className="text-[11px] leading-relaxed text-zinc-400">
              A árvore tem mais {preview.otherDirtyCount} arquivo(s) modificado(s) que não são
              desta correção (normalmente <code>.pbl</code> de build). Eles <strong>não</strong>{" "}
              entram no commit.
            </p>
          )}

          <button
            onClick={() =>
              run("commit", () => commitCard(card.id, { files: [...selected] }))
            }
            disabled={busy !== null || selected.size === 0 || !preview.onExpectedBranch}
            className="flex items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {busy === "commit" ? (
              <LuLoaderCircle className="size-4 animate-spin" />
            ) : (
              <LuGitCommitHorizontal className="size-4" />
            )}
            Commitar {selected.size} arquivo(s) — :bug:fix {card.jiraKey}
          </button>
        </>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
