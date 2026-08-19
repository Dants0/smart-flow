import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Carrega o CLAUDE.md do módulo alvo. É o "briefing" que dá à IA o
 * contexto específico daquele módulo (convenções, armadilhas, glossário).
 * Cada módulo do SMART tem o seu: modules/<modulo>/CLAUDE.md
 */
export async function loadModuleContext(module: string): Promise<string> {
  const path = join(process.cwd(), 'modules', module, 'CLAUDE.md');
  try {
    return await readFile(path, 'utf8');
  } catch {
    return `# Módulo ${module}\n(CLAUDE.md ainda não criado)`;
  }
}
