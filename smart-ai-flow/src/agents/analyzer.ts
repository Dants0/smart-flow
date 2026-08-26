import { callJsonAgent } from './jsonCall';
import { retrieveContext } from '../infra/pbInsight';
import { loadModuleContext } from '../infra/moduleContext';
import { getSettings } from '../infra/settingsRepository';
import {
  gatherSourceMaterial,
  reuseInventory,
  formatReuseInventory,
  ANALYZER_BUDGET,
} from '../infra/sourceExcerpts';
import { buildSkillSection } from '../domain/skill';
import { buildTraceSection } from '../domain/traceSection';
import { AnalyzerOutputSchema, type AnalyzerOutput } from './contracts';
import type { Card } from '../domain/card';
import type { LlmResult } from '../infra/llm';

export interface AnalysisResult {
  output: AnalyzerOutput;
  usage: LlmResult;
  /** false = rodou sem trecho real de código no prompt (ver pbInsight.ts) */
  grounded: boolean;
}

const SYSTEM = `Você é um desenvolvedor sênior de PowerBuilder/PFC no sistema SMART.
Sua tarefa é analisar o chamado e levantar a CAUSA RAIZ, não propor código ainda.

Responda SOMENTE com um objeto JSON válido, sem markdown, sem texto fora do JSON, neste formato:
{
  "rootCause": string,
  "reasoning": string[],
  "affectedObjects": [{ "name": string, "type": string, "reason": string }],
  "needsTrace": boolean,
  "confidence": "baixa" | "media" | "alta"
}

# A regra que vale mais que todas as outras

**Você NÃO pede ao dev nada que esteja em arquivo versionado.** A plataforma tem
o repositório montado e busca por você: os objetos que você citar em
affectedObjects são resolvidos no índice de arquivos e lidos do fonte, e termo
citado sem definição no material vira busca literal na rodada seguinte.

- **Proibido**: "me cola a seção X do .srd", "qual janela abre esse pop-up?",
  "quem chama wf_seleciona_horario?", "em qual biblioteca está esse objeto?".
  Isso não é falta de contexto — é busca que a esteira faz sozinha. Em vez de
  perguntar, **nomeie o objeto em affectedObjects e diga no reason o que precisa
  ser lido dentro dele.**
- **Permitido** (só o humano ou a produção sabem): reproduz no layout legado
  também ou só na tela nova? manter a aparência antiga ou pode modernizar?
  print antes/depois. Isso vai em reasoning, começando por "PERGUNTA AO DEV:".

Heurística: se a pergunta é sobre **código**, é proibida; se é sobre **intenção,
ambiente ou estado do .pbl**, é permitida.

# Protocolo de investigação (na ordem — o passo 5 é o divertido, não comece por ele)

1. **Traduza o sintoma num número ou numa string literal.** Número redondo no
   relato — 255, 2000, 4000, 32766 — é constante no código, não acidente de
   layout: diga qual é e mande procurar por ele. Frase de tela vira busca pelo
   PREFIXO literal, nunca pela frase inteira (ela é concatenada em runtime) e
   nunca por trecho acentuado (o fonte alterna Latin-1 e UTF-8, e o match falha
   em silêncio).
2. **Ache o ponto de entrada pelo que o usuário vê**: título de janela, texto de
   botão, label.
3. **Monte a cadeia de chamada até o pixel** e escreva-a em reasoning numa linha
   começando por "CADEIA:", no formato
   evento → função → OpenWithParm(w_x) → w_x.open → f_global.
   **A investigação só termina quando o último elo é uma linha que altera
   aparência ou conteúdo.** Enquanto o fim da cadeia for "popula um datastore",
   falta cadeia — e o elo que falta vira objeto em affectedObjects.
4. **Inventário de reuso** — o bloco "Inventário de reuso" do contexto responde,
   quando existe. Duas listas: quem chama este fluxo, e quem mais usa o objeto
   que vai ser alterado. Registre em reasoning numa linha "REUSO:". Mais de um
   ponto de entrada = todos entram em affectedObjects, ou o chamado volta.
5. **Escopo.** Para cada causa, decida se corrige aqui ou vira chamado separado,
   e quantifique o raio ("função global usada por N objetos"). Linha "ESCOPO:"
   em reasoning. Causa-raiz encontrada não é o mesmo que causa-raiz a corrigir
   NESTE ticket.

# "Texto cortado" nunca é uma hipótese, são três camadas

Antes de olhar layout, diga em QUAL camada os bytes somem: **gravação** (MID,
coluna curta, variável de tamanho fixo), **leitura** (o SELECT lê a coluna
truncada em vez da íntegra) ou **exibição** (controle, autosize, troca de fonte
depois do cálculo de altura). Propriedade de controle é a ÚLTIMA coisa a
investigar, porque é a mais fácil de teorizar sem evidência — e corrigir só a
exibição, quando o dado já chegou cortado, não resolve o chamado.

# Regras de saída

- needsTrace = true só quando o que falta é EVIDÊNCIA DE EXECUÇÃO (um pbtrace
  mostrando o que aconteceu na máquina). Se o que falta é ler código, não marque
  needsTrace: liste os objetos em affectedObjects — a plataforma busca o código
  deles no repositório e entrega pro próximo estágio.
- **affectedObjects é a sua LISTA DE BUSCA, não só a lista de culpados.** Cite
  todo objeto cujo fonte precisa ser lido pra fechar a cadeia, inclusive os que
  você só suspeita: nome que não existe no repositório é descartado em silêncio
  pelo índice, então palpite custa nada e omissão custa o chamado. Marque no
  reason o que é hipótese, começando por "HIPÓTESE — buscar ..."; o que veio
  confirmado no contexto entra sem essa marca.
- Não invente causa raiz pra preencher espaço: análise honesta sobre o que falta
  vale mais que hipótese confiante. Mas "ainda não sei" só é resposta aceitável
  depois de você ter nomeado os objetos que tirariam a dúvida.
- **Confira o sistema alvo antes de analisar.** Menção a SMARTWEB ou WEBLAUDOS =
  SMART Web. Menção a ATENDE, CADGF, AGENDA, PACDEL ou CIRURG sem citar
  SMARTWEB/WEBLAUDOS = SMART Desktop. Se o card estiver classificado no sistema
  errado, diga isso em reasoning[0] — a análise sai contra o codebase errado.
- **affectedObjects tem que cobrir TODOS os objetos com o defeito, não só o
  citado no chamado.** Quando o contexto trouxer a seção "Mesmo evento em
  outros objetos (abrangência)", examine cada um: os que têm o mesmo defeito
  entram em affectedObjects com o reason dizendo que é a mesma causa raiz; os
  que já estão corretos ficam de fora, e um deles vale ser citado em reasoning
  como o padrão correto de referência. Corrigir 1 objeto quando N têm o mesmo
  defeito é entrega incompleta, não escopo enxuto.
- Aponte objetos concretos do codebase (windows, datawindows, NVOs, procedures).
- Considere diferenças entre ambientes Oracle e SQL Server quando relevante.`;

export async function runAnalysis(card: Card): Promise<AnalysisResult> {
  const moduleContext = await loadModuleContext(card.module); // CLAUDE.md do módulo
  const { skills } = await getSettings(); // skill do time (Configurações > IA)
  // A dica do dev entra na busca junto do chamado: se ele citou d_agm09tab, é
  // esse objeto que o RAG precisa procurar, não o que o texto do suporte sugere.
  const buscaTexto = [card.devHints ?? '', card.rawTicket].join('\n');
  const { text: retrieved, grounded } = await retrieveContext(card.module, buscaTexto);

  /*
   * CÓDIGO REAL do repositório já na ANÁLISE — não só na proposta.
   *
   * Até aqui o analyzer enxergava só o RAG do PB Insight, e era essa a venda:
   * busca semântica traz o parecido e erra o idêntico. No SMART-51229 a causa
   * final morava numa função global (`font_color.srf`) que nenhuma busca por
   * "instruções cortadas na agenda" traria — e quem monta a cadeia de chamada é
   * a ANÁLISE. Sem fonte na frente ela só podia teorizar sobre propriedade de
   * controle, que foi exatamente onde travou por cinco mensagens.
   *
   * Os objetos ainda não foram nomeados (é o que este estágio vai fazer), então
   * a busca parte do que o chamado e o dev escreveram: identificadores no estilo
   * PowerBuilder, literais de tela entre aspas e os ancestrais declarados nos
   * fontes que abrirem.
   */
  const material = await gatherSourceMaterial(card.module, [], buscaTexto, ANALYZER_BUDGET);

  const codeSection = material.excerpts.length
    ? material.excerpts.map((e) => `## ${e.path}\n\`\`\`\n${e.content}\n\`\`\``).join('\n\n')
    : '(a busca pelo texto do chamado não abriu nenhum fonte — nomeie em ' +
      'affectedObjects os objetos que precisam ser lidos; a plataforma os busca)';

  // Quem mais toca os objetos que os fontes acima revelaram (passo 4).
  const reuse = formatReuseInventory(
    await reuseInventory(
      card.module,
      material.excerpts.map((e) => e.path.slice(e.path.lastIndexOf('/') + 1)),
    ),
  );

  const traceSection = buildTraceSection(card.traceAnalysis, 'analise');

  /*
   * O que o dev escreveu na criação do card. Vem ANTES do resto de propósito:
   * é a única parte do prompt escrita por alguém com o sistema na frente.
   */
  const hintSection = card.devHints?.trim()
    ? [
        '# Direcionamento do dev (quem abriu o card)',
        'Isto foi escrito por um desenvolvedor do time, com acesso ao sistema e ao',
        'banco. Trate como EVIDÊNCIA, não como sugestão: se ele aponta uma query,',
        'uma DataWindow ou um objeto, comece por aí. Contradizer isso exige motivo',
        'explícito no raciocínio.',
        '',
        card.devHints.trim(),
        '',
      ].join('\n')
    : '';

  const userPrompt = [
    hintSection,
    `# Chamado ${card.jiraKey}`,
    card.rawTicket,
    card.images?.length ? `\n(${card.images.length} screenshot(s) anexado(s) abaixo — use-os pra ler mensagens de erro, telas do PB e estado da UI)` : '',
    traceSection,
    '',
    '# Código real do repositório (busca a partir do texto do chamado, com nº de linha)',
    codeSection,
    reuse,
    '',
    '# Contexto do módulo',
    moduleContext,
    '',
    '# Trechos relevantes do codebase (RAG)',
    retrieved,
  ].join('\n');

  const { output, usage } = await callJsonAgent(AnalyzerOutputSchema, {
    system: SYSTEM + buildSkillSection(skills),
    userText: userPrompt,
    images: card.images,
    // Teto de saída. Já subiu duas vezes (2000 -> 4000 -> 16000) pelo mesmo
    // sintoma: análise longa chega cortada, o JSON não fecha e o card vai pra
    // ERRO por um motivo que não é erro. A última análise que passou gastou
    // 3492 dos 4000 — 87% do teto, ou seja, o próximo chamado um pouco maior
    // ia estourar de qualquer jeito. Sonnet 5 entrega bem mais que isso, e o
    // custo é por token gasto, não por teto pedido: teto alto não cobra a mais.
    maxTokens: 16000,
  });

  /*
   * `grounded` é a bandeira que a UI usa pra avisar "esta análise rodou sem
   * código real na frente". Agora que o repositório entra aqui, material lido
   * do fonte conta como grounding: marcar "sem código" só porque o pb-insight
   * estava fora do ar seria mentira na direção contrária.
   */
  return { output, usage, grounded: grounded || material.excerpts.length > 0 };
}
