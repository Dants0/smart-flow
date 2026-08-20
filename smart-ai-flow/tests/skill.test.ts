import { describe, expect, it } from 'vitest';
import { buildSkillSection } from '../src/domain/skill';

describe('skill do time', () => {
  it('sem skill, não acrescenta nada ao prompt', () => {
    expect(buildSkillSection(null)).toBe('');
    expect(buildSkillSection(undefined)).toBe('');
  });

  it('trata texto em branco como ausência de skill', () => {
    // campo esvaziado na UI chega como espaço/quebra de linha — não pode virar
    // um bloco "Skill do time" vazio no prompt
    expect(buildSkillSection('   \n  ')).toBe('');
  });

  it('inclui o texto colado e o delimita', () => {
    const section = buildSkillSection('1. Reproduzir com o pbtrace ligado.');

    expect(section).toContain('# Skill do time');
    expect(section).toContain('1. Reproduzir com o pbtrace ligado.');
    expect(section).toContain('--- início da skill ---');
    expect(section).toContain('--- fim da skill ---');
  });

  it('avisa o modelo que o formato de saída do agente prevalece', () => {
    // a skill é texto humano e pode pedir "responda em markdown"; sem esta
    // ressalva o parseAgentOutput quebraria
    expect(buildSkillSection('responda em markdown')).toContain('o JSON definido nas regras vence');
  });

  it('preserva o texto do dev sem reformatar', () => {
    const colado = '## Passo a passo\n\n- checar INI\n- checar Oracle vs SQL Server';
    expect(buildSkillSection(colado)).toContain(colado);
  });
});
