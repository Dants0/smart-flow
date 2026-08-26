import { describe, expect, it } from 'vitest';
import {
  ANALYZER_BUDGET,
  PROPOSER_BUDGET,
  formatReuseInventory,
  selectExcerpt,
} from '../src/infra/sourceExcerpts';

describe('inventário de reuso no prompt', () => {
  it('sem consumidor, sem seção — prompt não paga por bloco vazio', () => {
    expect(formatReuseInventory([])).toBe('');
  });

  it('lista os outros fontes que citam o objeto', () => {
    const bloco = formatReuseInventory([
      {
        object: 'w_exibe_inst',
        paths: ['ws_objects/agenda50/agenda50.pbl.src/w_agd03.srw', 'ws_objects/smm50/u_dw_smm_lab.sru'],
        truncated: false,
      },
    ]);

    expect(bloco).toContain('w_exibe_inst');
    expect(bloco).toContain('u_dw_smm_lab.sru');
    // as duas perguntas do passo 4 vêm junto: sem elas a lista vira decoração
    expect(bloco).toContain('Quem me chama?');
    expect(bloco).toContain('Quem mais usa o que eu vou alterar?');
  });

  it('avisa quando há mais consumidores do que os listados', () => {
    const bloco = formatReuseInventory([
      { object: 'f_ajusta_dw_font_color', paths: ['a.srw', 'b.srw'], truncated: true },
    ]);
    expect(bloco).toContain('+ outros além destes 2');
  });
});

describe('orçamento por estágio', () => {
  /*
   * A análise precisa de LARGURA (a cadeia atravessa objetos) e a proposta de
   * PROFUNDIDADE (o bloco inteiro que ela reescreve). Se os dois orçamentos
   * empatarem, um dos dois estágios está sendo servido errado.
   */
  it('a análise lê mais arquivos, com menos de cada um', () => {
    expect(ANALYZER_BUDGET.maxFiles).toBeGreaterThan(PROPOSER_BUDGET.maxFiles);
    expect(ANALYZER_BUDGET.maxCharsPerFile).toBeLessThan(PROPOSER_BUDGET.maxCharsPerFile);
  });

  it('selectExcerpt respeita o teto que recebe, não o teto global', () => {
    const corpo = Array.from({ length: 300 }, (_, i) => `  // linha de corpo ${i}`);
    const fonte = [
      'event clicked;call super::clicked;',
      ...corpo,
      'end event',
      '',
      'public function integer wf_exibir_instrucoes ();STRING sTexto',
      ...corpo,
      'end function',
    ].join('\n');

    const apertado = selectExcerpt(fonte, ['clicked', 'wf_exibir_instrucoes'], 2000);
    const folgado = selectExcerpt(fonte, ['clicked', 'wf_exibir_instrucoes'], 100000);

    expect(apertado.length).toBeLessThan(folgado.length);
    // com teto apertado o segundo bloco não cabe, e isso é dito em vez de sumir
    expect(apertado).toContain('não couberam no orçamento');
  });
});
