import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Módulos que rodam acoplados DENTRO do SMART Desktop. O card não pede qual
 * deles é o alvo — o chamado nem sempre deixa claro, e errar a escolha entrega
 * à IA o briefing do módulo errado. Escolhido "smartdesktop", o briefing dos
 * quatro entra junto e a IA decide onde o problema mora.
 */
const SMART_DESKTOP_MODULES = ['atende', 'agenda', 'mwsus', 'cadgf'] as const;

/**
 * Carrega o briefing que vai no prompt: o CLAUDE.md do sistema alvo. É o que dá
 * à IA o contexto específico daquele código (convenções, armadilhas, glossário).
 *
 * - `smartweb` → modules/smartweb/CLAUDE.md
 * - `smartdesktop` → modules/smartdesktop/CLAUDE.md (o que é comum a todos)
 *   seguido do briefing de cada módulo acoplado
 * - qualquer outro valor → modules/<valor>/CLAUDE.md, que é o caminho dos
 *   cards antigos, criados quando o dev escolhia o módulo direto
 */
export async function loadModuleContext(module: string): Promise<string> {
  if (module !== 'smartdesktop') return readBriefing(module);

  const parts = await Promise.all([
    readBriefing('smartdesktop'),
    ...SMART_DESKTOP_MODULES.map(readBriefing),
  ]);
  return parts.join('\n\n---\n\n');
}

async function readBriefing(module: string): Promise<string> {
  const path = join(process.cwd(), 'modules', module, 'CLAUDE.md');
  try {
    return await readFile(path, 'utf8');
  } catch {
    return `# Módulo ${module}\n(CLAUDE.md ainda não criado)`;
  }
}
