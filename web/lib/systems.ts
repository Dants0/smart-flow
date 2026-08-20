/**
 * Sistema alvo do card. O SMART Desktop acopla ATENDE, AGENDA, MWSUS e CADGF —
 * o dev escolhe o sistema, não o módulo: o chamado nem sempre deixa claro qual
 * módulo é, e errar a escolha manda o briefing errado pra IA. Identificar o
 * módulo passou a ser parte da análise.
 */
export const SYSTEMS = [
  { value: "smartdesktop", label: "SMART Desktop", hint: "" },
  { value: "smartweb", label: "SMART Web", hint: "" },
] as const;

/**
 * Rótulo exibido no card. Cards criados antes desta mudança guardam o módulo
 * direto ('atende', 'agenda', ...) e continuam existindo no board — por isso o
 * fallback mostra o módulo com o sistema entre parênteses, em vez de um valor solto.
 */
const LEGACY_DESKTOP_MODULES = ["atende", "agenda", "mwsus", "cadgf"];

export function systemLabel(module: string): string {
  const known = SYSTEMS.find((s) => s.value === module);
  if (known) return known.label;
  if (LEGACY_DESKTOP_MODULES.includes(module)) {
    return `${module.toUpperCase()} · SMART Desktop`;
  }
  return module;
}
