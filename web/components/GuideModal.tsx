"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  LuX,
  LuLightbulb,
  LuCircleCheckBig,
  LuTriangleAlert,
  LuArrowRight,
} from "react-icons/lu";

/**
 * Primeiros passos e boas práticas.
 *
 * O conteúdo não é genérico: cada item aqui saiu de algo que já deu errado ou
 * que mediu diferença real no uso da plataforma — a dica do dev que faz a busca
 * achar o arquivo, o objeto de nome gêmeo, o `.pbl` que não pode subir. Guia que
 * repete o óbvio ninguém lê duas vezes.
 */
function Section({
  n,
  title,
  children,
}: {
  n?: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-3">
      {n !== undefined && (
        <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
          {n}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="mb-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">{title}</h3>
        <div className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{children}</div>
      </div>
    </section>
  );
}

export function GuideModal({ onClose }: { onClose: () => void }) {
  // Esc fecha, como no resto da plataforma
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl dark:bg-zinc-900"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <LuLightbulb className="size-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              Como usar a esteira
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
          >
            <LuX className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto px-6 py-5">
          <p className="rounded-lg bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
            A IA analisa o chamado contra o <strong>código real</strong> do SMART e propõe um
            diff. Você revisa, aceita e a plataforma commita e abre o PR.{" "}
            <strong>Ela nunca fecha um chamado sozinha</strong> — cada passo que escreve em algo
            (código, repositório, Jira) espera um clique seu.
          </p>

          <div className="flex flex-col gap-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Primeiros passos
            </h3>

            <Section n={1} title="Configure seu Jira (uma vez)">
              Em{" "}
              <Link href="/settings/account" className="underline underline-offset-2">
                Minha conta
              </Link>{" "}
              coloque seu usuário e senha do Jira e use <strong>Testar conexão</strong>. Sem isso
              os chamados atribuídos a você não aparecem. Tem um <strong>?</strong> ali com o
              passo a passo se algo travar.
            </Section>

            <Section n={2} title="Crie o card com o chamado">
              Digite a chave (<code>SMART-12345</code>) e clique no botão do Jira para puxar
              descrição e anexos automaticamente. Escolha o <strong>sistema</strong> — SMART
              Desktop ou SMART Web; descobrir o módulo é trabalho da análise, não seu.
            </Section>

            <Section n={3} title="Preencha “O que você já sabe”">
              É o campo que mais muda o resultado. Cite o objeto suspeito, a DataWindow, a query,
              ou o que você já descartou — a IA trata isso como{" "}
              <strong>evidência</strong> e usa os nomes citados para{" "}
              <strong>abrir esses arquivos no repositório</strong>.
              <span className="mt-1 block rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                Medido num chamado vago: <strong>sem</strong> dica a plataforma abriu 0 arquivos;
                com a dica (“acho que é a <code>uof_testar_status</code> do{" "}
                <code>u_dw_pac</code>”), abriu o arquivo certo com o corpo da função.
              </span>
            </Section>

            <Section n={4} title="Revise o que ela propôs">
              O card mostra <strong>o que muda</strong> e <strong>onde muda</strong> — arquivos,
              linhas e o diff de cada um. Não entendeu alguma coisa? Use a aba{" "}
              <strong>Perguntar</strong>: a IA já tem o chamado, a análise, o diff e o código na
              mão, você não precisa colar nada.
            </Section>

            <Section n={5} title="Aceite e versione">
              <strong>Aceitar e versionar</strong> aplica o diff no seu working copy e leva o card
              para Versionamento — commit na branch do chamado, push, PR e o comentário de
              entrega no Jira, um passo de cada vez. A alteração é local e reversível de um
              clique até você commitar.
            </Section>
          </div>

          <div className="flex flex-col gap-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Boas práticas
            </h3>

            <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              <li className="flex gap-2">
                <LuCircleCheckBig className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <span>
                  <strong>Anexe print e pbtrace.</strong> A IA lê os screenshots (mensagem de
                  erro, título da janela) e o trace vira diagnóstico antes da análise. Evidência
                  de execução pesa mais que suposição sobre o código.
                </span>
              </li>
              <li className="flex gap-2">
                <LuCircleCheckBig className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <span>
                  <strong>Rejeitando, escreva o porquê.</strong> A nota vai para a próxima
                  tentativa. “Rejeitar” em branco só faz a IA tentar de novo às cegas.
                </span>
              </li>
              <li className="flex gap-2">
                <LuCircleCheckBig className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <span>
                  <strong>Descreva o que aplicou de fato ao resolver.</strong> É esse texto que
                  entra na base de conhecimento e melhora os próximos chamados — se ficar em
                  branco, a base guarda o diff da IA, que pode não ser o que resolveu.
                </span>
              </li>
              <li className="flex gap-2">
                <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <span>
                  <strong>Confira a pasta, não só o nome do objeto.</strong> O repositório tem
                  gêmeos (<code>w_siscolo_citopatologico</code> e{" "}
                  <code>w_sismama_citopatologico</code>). A tela mostra o caminho embaixo do nome
                  justamente por isso.
                </span>
              </li>
              <li className="flex gap-2">
                <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <span>
                  <strong>No commit, confira o que está marcado.</strong> Só fonte
                  (<code>.sr*</code>, e o <code>.prp</code> no SMART Web) sobe;{" "}
                  <code>.pbl</code>/<code>.pbw</code>/<code>.pbd</code> ficam bloqueados. Arquivo
                  fora do padrão aparece <strong>desmarcado e em âmbar</strong> — olhe antes de
                  marcar.
                </span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              O que a plataforma não faz
            </h3>
            <ul className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              <li>
                <strong>Não testa nada.</strong> Por isso a seção EVIDÊNCIAS do comentário do
                Jira sai em branco: a prova é sua.
              </li>
              <li>
                <strong>Não troca de branch.</strong> Se o working copy não estiver na{" "}
                <code>bug/SMART-XXXXX</code>, ela recusa e avisa — trocar com a árvore suja
                destruiria trabalho seu.
              </li>
              <li>
                <strong>Pode errar.</strong> Quando a proposta cita arquivo que não existe no
                repositório, o card mostra um aviso vermelho antes do diff. Nesse caso trate como
                hipótese e peça nova proposta.
              </li>
            </ul>
          </div>

          <p className="text-xs leading-relaxed text-zinc-400">
            O <strong>Monitor de Recursos</strong> (em Configurações) mostra o estado de tudo:
            banco, Jira, PB Insight, os dois repositórios e o consumo de IA dos últimos 30 dias.
          </p>
        </div>

        <div className="flex justify-end border-t border-zinc-200 px-6 py-3 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Começar
            <LuArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
