"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LuChevronLeft, LuKeyRound, LuServer, LuGauge, LuUser, LuUsers, LuLogOut } from "react-icons/lu";
import { SiJira } from "react-icons/si";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthGuard } from "@/components/AuthGuard";
import { clearToken } from "@/lib/auth";

const NAV = [
  { href: "/settings/account", label: "Minha conta", description: "Perfil e Jira pessoal", icon: LuUser },
  { href: "/settings/jira", label: "Jira", description: "Instância e busca", icon: SiJira, adminOnly: true },
  { href: "/settings/ai", label: "IA", description: "Provider do pipeline", icon: LuKeyRound, adminOnly: true },
  { href: "/settings/services", label: "Serviços", description: "URLs dos microserviços", icon: LuServer, adminOnly: true },
  { href: "/settings/users", label: "Usuários", description: "Quem acessa a plataforma", icon: LuUsers, adminOnly: true },
  { href: "/settings/resources", label: "Monitor de Recursos", description: "Status, fila e custo", icon: LuGauge },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthGuard>
      {(user) => (
        <div className="flex h-full flex-col bg-zinc-50 dark:bg-black">
          <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
            >
              <LuChevronLeft className="size-4" />
              Voltar pro board
            </Link>
            <div className="ml-2 border-l border-zinc-200 pl-4 dark:border-zinc-800">
              <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Configurações da plataforma
              </h1>
              <p className="text-xs text-zinc-400">
                {user.displayName}
                {user.isAdmin && " · administrador"}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={() => {
                  clearToken();
                  // hard reload: descarta settings já carregadas da sessão anterior
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.href = "/login";
                }}
                title="Sair"
                className="rounded-md border border-zinc-300 p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
              >
                <LuLogOut className="size-4" />
              </button>
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden">
            <nav className="w-64 shrink-0 overflow-y-auto border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <ul className="flex flex-col gap-1">
                {NAV.filter((item) => !item.adminOnly || user.isAdmin).map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 transition ${
                          active ? "bg-zinc-900 dark:bg-white" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                        }`}
                      >
                        <div
                          className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
                            active
                              ? "bg-white/15 text-white dark:bg-zinc-900/10 dark:text-zinc-900"
                              : "bg-zinc-100 text-zinc-500 group-hover:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:text-zinc-200"
                          }`}
                        >
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div
                            className={`text-sm font-medium ${
                              active ? "text-white dark:text-zinc-900" : "text-zinc-700 dark:text-zinc-300"
                            }`}
                          >
                            {item.label}
                          </div>
                          <div
                            className={`truncate text-[11px] ${
                              active ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-400"
                            }`}
                          >
                            {item.description}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <main className="flex-1 overflow-y-auto p-8">
              <div className="mx-auto max-w-2xl">{children}</div>
            </main>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}
