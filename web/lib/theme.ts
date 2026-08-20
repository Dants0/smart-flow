export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "smart-ai-flow:theme";

export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveIsDark(theme: ThemePreference): boolean {
  return theme === "dark" || (theme === "system" && systemPrefersDark());
}

export function applyTheme(theme: ThemePreference) {
  document.documentElement.classList.toggle("dark", resolveIsDark(theme));
}

export function setStoredTheme(theme: ThemePreference) {
  window.localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

/** Script inline injetado no <head> — roda antes da hidratação pra não piscar o tema errado. */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem('${STORAGE_KEY}');
    var isDark = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
