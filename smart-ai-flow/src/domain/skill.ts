/**
 * Skill do time — texto livre que o dev cola em Configurações > IA descrevendo
 * COMO ele resolve chamado: passo a passo, o que checar antes, convenções que
 * o CLAUDE.md do módulo não cobre.
 *
 * Diferente do contexto de módulo (que é sobre o CÓDIGO) e do RAG (que é o
 * código em si): a skill é sobre o MÉTODO. Por isso entra no system prompt,
 * junto das regras do agente, e não no meio do material de contexto.
 */

/**
 * Teto do texto. A skill entra em TODA análise e TODA proposta, então cada
 * caractere é pago em cada card e disputa espaço com o RAG na janela de
 * contexto. ~20k caracteres ≈ 5k tokens, o suficiente pra um procedimento
 * detalhado sem sufocar o resto do prompt.
 */
export const MAX_SKILL_CHARS = 20000;

/**
 * Monta o bloco que vai colado ao system prompt do agente. String vazia quando
 * não há skill: sem skill configurada, o prompt fica idêntico ao de antes.
 *
 * A skill é texto colado por um humano e pode, sem má intenção, mandar o modelo
 * "responder em markdown" ou "explicar o raciocínio antes" — o que quebraria o
 * `parseAgentOutput`. Por isso o bloco vem delimitado e declara explicitamente
 * que o formato de saída definido pelo agente vence.
 */
export function buildSkillSection(skills: string | null | undefined): string {
  const text = skills?.trim();
  if (!text) return '';

  return [
    '',
    '',
    '# Skill do time',
    'O time colou abaixo o procedimento que segue pra resolver este tipo de chamado.',
    'Trate como instrução de COMO trabalhar — o que checar, em que ordem, o que já',
    'foi descartado antes. Ela NÃO altera o formato de resposta exigido acima: se a',
    'skill pedir outro formato, o JSON definido nas regras vence.',
    '--- início da skill ---',
    text,
    '--- fim da skill ---',
  ].join('\n');
}
