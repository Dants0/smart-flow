"use client";

import Link from "next/link";
import { LuCircleCheck, LuCircleAlert, LuArrowRight } from "react-icons/lu";
import type { AuthUser, SetupStep } from "@/lib/auth";

const STEPS: Record<SetupStep, { title: string; description: string }> = {
  password: {
    title: "Trocar a senha provisória",
    description: "Sua conta foi criada por um administrador com uma senha temporária.",
  },
  jira: {
    title: "Configurar suas credenciais do Jira",
    description:
      "Sem elas a plataforma não consegue buscar chamados nem detectar os que foram atribuídos a você.",
  },
};

/**
 * Sem isto, o usuário novo simplesmente não via chamado nenhum e não tinha como
 * saber que faltava configurar algo — a falha do Jira era engolida em silêncio.
 */
export function SetupBanner({ user }: { user: AuthUser }) {
  if (user.setupPending.length === 0) return null;

  const total = Object.keys(STEPS).length;
  const done = total - user.setupPending.length;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 dark:border-amber-900 dark:bg-amber-950/40">
      <div className="flex items-start gap-3">
        <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              Setup inicial pendente
            </span>
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              {done}/{total}
            </span>
          </div>

          <ul className="mt-1.5 flex flex-col gap-1">
            {(Object.keys(STEPS) as SetupStep[]).map((step) => {
              const pending = user.setupPending.includes(step);
              return (
                <li key={step} className="flex items-start gap-2 text-xs">
                  {pending ? (
                    <span className="mt-0.5 size-3.5 shrink-0 rounded-full border-2 border-amber-400" />
                  ) : (
                    <LuCircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span
                    className={
                      pending
                        ? "text-amber-800 dark:text-amber-200"
                        : "text-zinc-400 line-through dark:text-zinc-500"
                    }
                  >
                    <strong className="font-medium">{STEPS[step].title}</strong>
                    {pending && <> — {STEPS[step].description}</>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <Link
          href="/settings/account"
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-500"
        >
          Concluir setup
          <LuArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
