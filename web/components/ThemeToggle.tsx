"use client";

import { useEffect, useState } from "react";
import { LuSun, LuMoon, LuMonitor } from "react-icons/lu";
import { applyTheme, getStoredTheme, setStoredTheme, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; icon: typeof LuSun; label: string }[] = [
  { value: "light", icon: LuSun, label: "Tema claro" },
  { value: "system", icon: LuMonitor, label: "Seguir o sistema" },
  { value: "dark", icon: LuMoon, label: "Tema escuro" },
];

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>("system");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage só existe no client; lido após montar pra não divergir da renderização estática do server
    setTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  function select(next: ThemePreference) {
    setTheme(next);
    setStoredTheme(next);
  }

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => select(opt.value)}
            title={opt.label}
            aria-label={opt.label}
            className={`flex items-center justify-center rounded p-1.5 transition ${
              active
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
