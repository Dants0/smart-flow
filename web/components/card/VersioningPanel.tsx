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
  LuFilePen,
  LuRotateCcw,
  LuPackage,
} from "react-icons/lu";
import Link from "next/link";
import {
  applyCardDiff,
  getMe,
  commitCard,
  getJiraCommentDraft,
  getVersioningPreview,
  openPullRequest,
  postJiraComment,
  resolveCard,
  revertCardDiff,
  type VersioningPreview,
} from "@/lib/api";
import type { Card } from "@/lib/types";
import type { AuthUser } from "@/lib/auth";

/**
 * Versionamento como passo a passo explícito.
 *
 * Um dev perguntou se aceitar a proposta já alterava o código e pulava pro
 * versionamento — sinal de que a tela anterior não deixava claro quem faz o
 * quê. Agora os passos são numerados e cada um tem um botão só:
 *
 *   1. aplicar o diff no código (ou editar na mão, fora daqui)
 *   2. commitar o que mudou, na branch do chamado
 *   3. push + PR
 *   4. comentário de entrega no Jira
 *   5. gerar a versão no MW desenv, com a credencial do dev validada na usr
 *   6. resolver o card, dizendo o que foi aplicado de fato
 *
 * O "o que você aplicou de fato" mora no último passo, e não lá no começo: é a
 * última coisa que o dev sabe, não a primeira.
 */
function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-3">
      <div
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          done
            ? "bg-emerald-600 text-white"
            : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
        }`}
      >
        {done ? <LuCircleCheckBig className="size-3.5" /> : n}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {title}
        </h4>
        {children}
      </div>
    </section>
  );
}

export function VersioningPanel({
  card,
  onUpdated,
}: {
  card: Card;
  onUpdated: (card: Card) => void;
}) {
  const [preview, setPreview] = useState<VersioningPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<
    null | "apply" | "revert" | "commit" | "pr" | "comment" | "resolve"
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [resolutionText, setResolutionText] = useState("");
  // A geração de versão sai com a credencial do MW desenv de quem está olhando.
  const [me, setMe] = useState<AuthUser | null>(null);

  useEffect(() => {
    getMe().then(setMe).catch(() => setMe(null));
  }, []);

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
    // o retrato do commit só existe depois que algo foi escrito no working copy
    if (!card.appliedAt || card.commitHash) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura do repositório
    load();
  }, [load, card.appliedAt, card.commitHash]);

  async function run(action: NonNullable<typeof busy>, fn: () => Promise<Card>) {
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

  return (
    <div className="flex flex-col gap-5 px-5 py-4">
      {/* 1. escrever no código */}
      <Step n={1} title="Aplicar o diff no código" done={!!card.appliedAt}>
        {card.appliedAt ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            <ul className="space-y-0.5 font-mono">
              {card.appliedFiles?.map((f) => (
                <li key={f} className="truncate" title={f}>
                  {f}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
              Alteração local, nada commitado ainda. Teste antes de seguir.
            </p>
            {!card.commitHash && (
              <button
                onClick={() => run("revert", () => revertCardDiff(card.id))}
                disabled={busy !== null}
                className="mt-2 flex items-center gap-1.5 rounded-md border border-emerald-300 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
              >
                {busy === "revert" ? (
                  <LuLoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <LuRotateCcw className="size-3.5" />
                )}
                Desfazer alteração
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => run("apply", () => applyCardDiff(card.id))}
              disabled={busy !== null || !card.proposal?.diff}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950"
            >
              {busy === "apply" ? (
                <LuLoaderCircle className="size-4 animate-spin" />
              ) : (
                <LuFilePen className="size-4" />
              )}
              Aplicar o diff no working copy
            </button>
            <p className="text-[11px] leading-relaxed text-zinc-400">
              É a única operação que escreve no seu código, e roda só neste clique. Se preferir
              editar na mão, edite e volte — o passo 2 lê o que estiver no repositório.
            </p>
          </div>
        )}
      </Step>

      {/* 2. commit */}
      <Step n={2} title="Commitar na branch do chamado" done={!!card.commitHash}>
        {card.commitHash ? (
          <p className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
            {card.commitHash.slice(0, 8)} em {card.branch} · {card.committedFiles?.length ?? 0}{" "}
            arquivo(s)
          </p>
        ) : !card.appliedAt ? (
          <p className="text-xs text-zinc-400">Aplique o diff (ou edite na mão) primeiro.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              {preview &&
                (preview.onExpectedBranch ? (
                  <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <LuCircleCheckBig className="size-3.5" />
                    Na branch {preview.currentBranch}
                  </p>
                ) : (
                  <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    <LuTriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>
                      O working copy está em{" "}
                      <strong>{preview.currentBranch || "(sem branch)"}</strong> e o esperado é{" "}
                      <strong>{preview.expectedBranch}</strong>. Troque de branch você mesmo — a
                      plataforma não troca, porque a árvore tem alterações suas.
                    </span>
                  </p>
                ))}
              <button
                onClick={load}
                disabled={loading}
                className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
              >
                <LuRefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
                Reler
              </button>
            </div>

            {preview && (
              <>
                <ul className="flex flex-col gap-1">
                  {preview.files.map((f) => {
                    const blocked = f.kind === "proibido";
                    const unusual = f.kind === "outro";
                    return (
                      <li
                        key={f.path}
                        className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
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
                          <p
                            className="truncate font-mono text-zinc-700 dark:text-zinc-300"
                            title={f.path}
                          >
                            {f.path}
                          </p>
                          <p className="text-[11px] text-zinc-400">
                            {f.status}
                            {blocked && " · artefato de build — nunca sobe"}
                            {unusual && " · fora do padrão — confira antes de marcar"}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {preview.otherDirtyCount > 0 && (
                  <p className="text-[11px] leading-relaxed text-zinc-400">
                    A árvore tem mais {preview.otherDirtyCount} arquivo(s) modificado(s) que não são
                    desta correção. Eles <strong>não</strong> entram no commit.
                  </p>
                )}

                <button
                  onClick={() => run("commit", () => commitCard(card.id, { files: [...selected] }))}
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
          </div>
        )}
      </Step>

      {/* 3. push + PR */}
      <Step n={3} title="Push e pull request" done={!!card.prUrl}>
        {card.prUrl ? (
          <a
            href={card.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
          >
            Pull request aberto
            <LuExternalLink className="size-3.5" />
          </a>
        ) : !card.commitHash ? (
          <p className="text-xs text-zinc-400">Depois do commit.</p>
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
      </Step>

      {/* 4. Jira */}
      <Step n={4} title="Comentário de entrega no Jira" done={!!card.jiraCommentAt}>
        {card.jiraCommentAt ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Publicado no {card.jiraKey}.
          </p>
        ) : showComment ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={12}
              className="resize-y rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
              <strong>EVIDÊNCIAS</strong> fica em branco de propósito: é prova de teste, e a
              plataforma não testou nada.
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
            className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            <LuMessageSquarePlus className="size-4" />
            Montar comentário
          </button>
        )}
      </Step>

      {/* 5. MW desenv */}
      <Step n={5} title="Gerar versão no MW desenv">
        {!me ? (
          <LuLoaderCircle className="size-4 animate-spin text-zinc-400" />
        ) : me.mwValidatedAt ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Credencial validada na tabela usr do MW20: a versão sai como{" "}
              <strong className="font-mono">{me.mwUser}</strong>.
            </p>
            {/*
              O disparo da geração ainda não foi integrado — nesta etapa só a
              credencial é cadastrada e conferida. O botão já mora aqui pra que
              ligar a integração não mude o fluxo que o dev conhece.
            */}
            <button
              disabled
              title="Disparo da geração de versão ainda não integrado"
              className="flex w-fit items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
            >
              <LuPackage className="size-4" />
              Gerar versão
            </button>
            <p className="text-[11px] text-zinc-400">Disparo da geração ainda não integrado.</p>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            {me.mwUser
              ? `Sua credencial do MW desenv não está validada${me.mwValidationError ? ` (${me.mwValidationError})` : ""}.`
              : "Você ainda não cadastrou sua credencial do MW desenv."}{" "}
            <Link href="/settings/account" className="underline">
              Configure em Minha conta
            </Link>{" "}
            para liberar a geração da versão com os seus dados.
          </p>
        )}
      </Step>

      {/* 6. fechar */}
      <Step n={6} title="Resolver o card">
        <div className="flex flex-col gap-2">
          <textarea
            value={resolutionText}
            onChange={(e) => setResolutionText(e.target.value)}
            placeholder="O que você aplicou de fato? Ex: o diff da IA não servia; ajustei o WHERE de d_agm09tab pra amarrar paciente + OS."
            rows={3}
            className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <p className="text-[11px] leading-relaxed text-zinc-400">
            É este texto que vai pra base de conhecimento e alimenta chamados futuros. Em branco, a
            base guarda o diff proposto pela IA — que pode não ser o que resolveu.
          </p>
          <button
            onClick={() =>
              run("resolve", () =>
                resolveCard(card.id, { resolutionText: resolutionText || undefined }),
              )
            }
            disabled={busy !== null}
            className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy === "resolve" ? (
              <LuLoaderCircle className="size-4 animate-spin" />
            ) : (
              <LuCircleCheckBig className="size-4" />
            )}
            Resolver
          </button>
        </div>
      </Step>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
