"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LuChevronLeft, LuKeyRound, LuServer } from "react-icons/lu";
import { SiJira } from "react-icons/si";

const NAV = [
  { href: "/settings/jira", label: "Jira", icon: SiJira },
  { href: "/settings/ai", label: "IA", icon: LuKeyRound },
  { href: "/settings/services", label: "Serviços", icon: LuServer },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-black">
      <header className="flex items-center gap-3 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          <LuChevronLeft className="size-4" />
          Voltar pro board
        </Link>
        <div className="ml-2 border-l border-zinc-200 pl-3 dark:border-zinc-800">
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Configurações da plataforma
          </h1>
          <p className="text-xs text-zinc-400">
            Substitui o .env — vale na hora, sem reiniciar o backend
          </p>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-52 shrink-0 border-r border-zinc-200 p-3 dark:border-zinc-800">
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
