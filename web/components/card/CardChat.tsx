"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LuSend, LuLoaderCircle, LuBot, LuUser, LuMessageSquare } from "react-icons/lu";
import { getCardChat, sendCardQuestion, type ChatMessage } from "@/lib/api";

const SUGESTOES = [
  "Por que essa é a causa raiz e não outra?",
  "O que quebra se eu aplicar isso?",
  "Como reproduzo o cenário do chamado?",
];

/**
 * Chat de dúvidas pontuais sobre a resolução.
 *
 * O contexto (chamado, análise, raciocínio, proposta, histórico e o código real
 * dos objetos citados) é montado no backend — o dev não recola nada. A conversa
 * fica salva no card: quem revisar semanas depois vê o que foi perguntado.
 */
export function CardChat({ cardId }: { cardId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setMessages(await getCardChat(cardId));
    } catch {
      // chat vazio ou indisponível não atrapalha a revisão
    }
  }, [cardId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    load();
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || sending) return;

    setSending(true);
    setError(null);
    setDraft("");

    // eco otimista: a resposta demora alguns segundos e a pergunta some do campo
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: question, at: new Date().toISOString() },
    ]);

    try {
      setMessages(await sendCardQuestion(cardId, question));
    } catch (err) {
      setError(err instanceof Error ? err.message : "falha ao perguntar");
      setDraft(question); // devolve o texto pro dev não reescrever
      await load();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <LuMessageSquare className="size-4 text-zinc-400" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Dúvidas sobre esta resolução
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !sending && (
          <div className="flex flex-col gap-2">
            <p className="text-xs leading-relaxed text-zinc-400">
              Pergunte sobre a análise, o diff ou o teste. A IA já tem o chamado, o raciocínio, a
              proposta e o código dos objetos citados — não precisa colar nada.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-left text-xs text-zinc-600 transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li key={m.id} className="flex gap-2">
              {m.role === "user" ? (
                <LuUser className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
              ) : (
                <LuBot className="mt-0.5 size-3.5 shrink-0 text-blue-500" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={`whitespace-pre-wrap text-sm leading-relaxed ${
                    m.role === "user"
                      ? "text-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {m.content}
                </p>
                {m.userName && (
                  <span className="text-[10px] text-zinc-400">{m.userName}</span>
                )}
              </div>
            </li>
          ))}
        </ul>

        {sending && (
          <p className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
            <LuLoaderCircle className="size-3.5 animate-spin" />
            Pensando com o contexto do card...
          </p>
        )}

        {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-end gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia, Shift+Enter quebra linha — é campo de pergunta curta
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          placeholder="Pergunte sobre a resolução..."
          rows={2}
          className="flex-1 resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="flex size-9 items-center justify-center rounded-lg bg-zinc-900 text-white transition hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900"
        >
          {sending ? (
            <LuLoaderCircle className="size-4 animate-spin" />
          ) : (
            <LuSend className="size-4" />
          )}
        </button>
      </form>
    </div>
  );
}
