import { describe, expect, it } from 'vitest';
import {
  asciiFallback,
  extractQuotedLiterals,
  termsWithoutDefinition,
} from '../src/infra/sourceExcerpts';

describe('literais de tela citados no chamado', () => {
  it('pega o título da janela que o usuário viu', () => {
    const texto =
      "O sistema não abre o pop-up 'Visualizar (Instruções)' após selecionar o serviço.";
    expect(extractQuotedLiterals(texto)).toEqual(['Visualizar (Instruções)']);
  });

  it('ignora identificador PowerBuilder entre aspas — esse já é achado como objeto', () => {
    expect(extractQuotedLiterals('a função "wf_buscar_instrucoes" não retorna')).toEqual([]);
  });

  it('ignora caminho de arquivo', () => {
    expect(extractQuotedLiterals('veja "ws_objects/agenda50/w_agd03.srw" no repo')).toEqual([]);
  });

  it('ignora aspas em volta de número ou símbolo', () => {
    expect(extractQuotedLiterals('o campo mostra "123456"')).toEqual([]);
  });
});

describe('alternativa sem acento pra busca literal', () => {
  it('devolve o maior trecho ASCII contíguo — imune à codificação do fonte', () => {
    expect(asciiFallback('Visualizar (Instruções)')).toBe('Visualizar (Instru');
  });

  it('trecho contíguo, não a maior palavra: "Visualizar" sozinho casaria com todo botão', () => {
    expect(asciiFallback('Visualizar (Instruções)')).not.toBe('Visualizar');
  });

  it('não devolve trecho curto demais, que traria o repositório inteiro', () => {
    expect(asciiFallback('Não há vaga')).toBeNull();
  });

  it('literal já em ASCII volta inteiro', () => {
    expect(asciiFallback('Deseja prosseguir?')).toBe('Deseja prosseguir?');
  });
});

describe('termos citados e não definidos', () => {
  const material = [
    {
      path: 'w_agd03.srw',
      content: [
        '199: public function boolean wf_seleciona_horario (long p_linha)',
        '3601: public function boolean wf_buscar_instrucoes (long p_cod);STRING sTexto',
        '3620: This.wf_seleciona_horario(nLinha)',
      ].join('\n'),
    },
  ];

  it('acha a função chamada cujo corpo não veio no material', () => {
    // wf_seleciona_horario só aparece como prototype (sem `;`) e como chamada
    expect(termsWithoutDefinition(material, ['wf_seleciona_horario'])).toEqual([
      'wf_seleciona_horario',
    ]);
  });

  it('não acusa lacuna quando a definição com corpo veio', () => {
    expect(termsWithoutDefinition(material, ['wf_buscar_instrucoes'])).toEqual([]);
  });

  it('termo que nem aparece no material não é lacuna, é ruído', () => {
    expect(termsWithoutDefinition(material, ['wf_qualquer_outra'])).toEqual([]);
  });
});
