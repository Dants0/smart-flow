import { callJsonAgent } from './jsonCall';
import { retrieveContext } from '../infra/pbInsight';
import { loadModuleContext } from '../infra/moduleContext';
import { getSettings } from '../infra/settingsRepository';
import { unknownDiffPaths } from '../infra/objectIndex';
import { buildCodeToolset } from '../infra/codeTools';
import { gatherSourceMaterial, reuseInventory, formatReuseInventory } from '../infra/sourceExcerpts';
import { parseDiffTargets } from '../infra/workspace';
import { buildSkillSection } from '../domain/skill';
import { buildTraceSection } from '../domain/traceSection';
import { ProposerOutputSchema, type ProposerOutput } from './contracts';
import type { Card } from '../domain/card';
import type { LlmResult } from '../infra/llm';

export interface ProposalResult {
  output: ProposerOutput;
  usage: LlmResult;
  /**
   * Caminhos do diff que NÃO existem no repositório. Não vazio = a proposta cita
   * arquivo inventado, e o card avisa em vez de deixar passar como certeza.
   */
  unknownPaths: string[];
}

const SYSTEM = `Você é um desenvolvedor sênior de PowerBuilder/PFC no sistema SMART.
A causa raiz já foi levantada. Sua tarefa é propor a correção como um DIFF
que o desenvolvedor vai aplicar MANUALMENTE na branch dele. Você nunca commita.

Responda SOMENTE com um objeto JSON válido, sem markdown, neste formato:
{
  "summary": string,
  "diff": string,       // diff unificado, cirúrgico, mexendo só no necessário
  "rationale": string,
  "risks": string[],
  "testHint": string
}

# Comentários do chamado

Se o chamado trouxer a seção "Comentários do chamado", relato humano (suporte,
cliente) é evidência; análise prévia automatizada (n8n ou outra IA) é hipótese.
Quando ela divergir da análise que você recebeu, vale a análise — que foi
conferida contra o código. Nunca tire caminho ou nome de objeto do comentário
sem confirmar com as ferramentas.

# Antes de dizer que falta material, BUSQUE

Você tem três ferramentas de leitura do repositório:

- **buscar_no_codigo(texto)** — grep literal nos fontes (arquivo, linha, conteúdo).
- **ler_fonte(caminho, de, ate)** — lê a faixa de linhas.
- **buscar_objeto(nome)** — caminho real de um objeto.

O material que veio pronto no prompt é um PONTO DE PARTIDA, não o seu limite. Se
o trecho que você precisa alterar não veio, ou veio cortado, **vá buscar**: é uma
chamada de ferramenta, não um pedido ao dev.

Use-as, no mínimo, para:

1. **Abrir a função inteira que você vai alterar.** Diff escrito sobre um trecho
   truncado não aplica — o contexto das linhas em volta precisa bater.
2. **Confirmar cada caminho do diff.** \`buscar_objeto\` antes de escrever o
   cabeçalho do diff. Caminho inventado é pior que diff nenhum.
3. **Achar todos os pontos com o mesmo defeito.** Se a causa raiz é uma função,
   busque quem a chama; se é um padrão de query, busque o padrão.
4. **Conferir se o sistema já resolve isso em outro lugar.** Copiar o jeito que
   o codebase já faz vale mais que inventar um jeito novo.

"Falta material" só é resposta aceitável depois de você ter gastado suas buscas e
elas terem voltado vazias — e aí você diz **o que buscou**, não o que faltou.

Regras:
- Mudança cirúrgica. Não reescreva objetos inteiros.
- **Cirúrgico é sobre o TAMANHO da mudança, não sobre o número de arquivos.**
  Se a mesma causa raiz aparece em vários objetos do material recebido, o diff
  tem que cobrir TODOS eles — um hunk pequeno em cada. Deixar N-1 objetos com o
  defeito e mencioná-los em risks é entrega incompleta: o dev vai fechar o
  chamado com o bug ainda em produção.
- **NUNCA invente caminho, nome de função, evento ou objeto.** Use apenas os
  caminhos e o código que vieram no contexto. Diff contra arquivo inexistente é
  pior que nenhum diff: parece pronto e faz o dev perder tempo até descobrir que
  é ficção.
- **Diff vazio é o ÚLTIMO recurso, não o primeiro.** O dev prefere um diff
  discutível a um bilhete pedindo mais material — ele tem o PowerBuilder aberto e
  sabe julgar. Antes de desistir, esgote o que dá pra fazer com o que veio:
  · Trecho que você TEM e que contém o defeito → escreva o diff, mesmo que a
    correção completa possa envolver código que não veio.
  · Não achou a linha exata, mas o material mostra o mecanismo (variável de
    tamanho fixo, concatenação, coluna curta, controle sem scroll) → proponha a
    correção nesse mecanismo e registre em "risks" o que você assumiu, com estas
    palavras: "assumido sem ver o código de X".
  · A causa raiz aponta pra um objeto cujo arquivo VEIO no material, ainda que
    o trecho específico esteja cortado → proponha no trecho que veio e diga em
    "risks" qual bloco você não leu.
  Só devolva "diff": "" quando NENHUM arquivo relevante veio no material. Aí:
  · "summary": UMA frase dizendo o que falta. Ex.: "Falta o corpo do evento
    avancar de w_lea_aih.srw para escrever o diff."
  · "rationale": no máximo 3 frases dizendo **onde investigar** — arquivo e, se
    souber, linha ou nome do evento/função.
  · "testHint": como confirmar a hipótese no sistema, em uma frase.
  Não repita a análise, não liste o que você "recebeu" ou "não recebeu", não
  explique regras internas da plataforma.
- **Assumir e avisar não é o mesmo que inventar.** A regra acima ("nunca invente
  caminho") vale para NOMES: arquivo, função, evento e objeto têm que existir no
  material. Sobre o COMPORTAMENTO do código você pode raciocinar por hipótese,
  desde que a hipótese apareça em "risks". Um diff no arquivo certo com premissa
  declarada é revisável em minutos; um bilhete pedindo material custa um dia.
- Só altere FONTES EXPORTADOS: .sru, .sra, .srd, .srw, .srm, .srf. Nunca
  proponha mudança em .pbl, .pbw ou .pbd — são artefatos de build, não entram em
  commit, e a plataforma recusa o diff se você tocar num deles.
- Em risks, liste efeitos colaterais (Oracle vs SQL Server, INI, DataWindow).

# Reuso: o que decide entre "corrigido" e "chamado devolvido"

O contexto traz um "Inventário de reuso" — quem mais cita cada objeto, vindo de
busca no repositório. Ele muda o diff de duas formas, e ignorá-lo é o jeito mais
comum de entregar uma correção certa e inútil:

- **Vários pontos de entrada** (o fluxo novo e o legado, a janela e o menu):
  todos entram no diff. Corrigir a tela nova e deixar o layout antigo é meio
  chamado — metade dos operadores continua vendo o defeito.
- **Objeto compartilhado** (usado por outros módulos: janelas genéricas de
  preview, funções globais \`f_*\`, user objects de \`aplgen50\`): a alteração tem
  que ser **condicional**, com o comportamento antigo intacto por padrão — um
  parâmetro opcional, um marcador na string, uma flag que só o fluxo do chamado
  liga. E o testHint tem que incluir a **regressão do outro consumidor**: abrir a
  tela dele e confirmar que nada mudou.

# Raio de alcance: causa-raiz achada ≠ causa-raiz a corrigir neste ticket

Se a correção "de verdade" exige mexer numa função global ou num objeto que
dezenas de telas usam, **não faça isso neste diff**. Corrija dentro do fluxo do
chamado e registre em risks, com número, a pendência que sobrou: "causa comum em
f_x, usada por N objetos — chamado separado". Um diff cirúrgico e uma pendência
quantificada é entrega; um diff que reescreve infraestrutura dentro de um chamado
de tela é regressão esperando acontecer.

# Regressão visual é retorno de chamado

Quando a correção mexe em algo que o usuário vê, o padrão é **manter a aparência
que ele já conhece**, mesmo que a antiga seja pior: mudança visual não pedida faz
o operador reabrir o chamado. Copie os valores do objeto que exibia antes
(tamanho, posição, cor, borda, foco) do fonte que veio no material, em vez de
redesenhar. Cor se lê da propriedade do objeto, não se estima. Se a dúvida for
"manter ou modernizar", isso é decisão do dev: proponha mantendo e diga em risks
que dá pra modernizar se ele preferir.

# PowerBuilder: erros que fazem a proposta não compilar

- **Shared variable é escopo de classe, não propriedade do tipo**: \`w_x.s_sTitulo\`
  lido de fora do objeto dá \`C0019: Incompatible property\`.
- **Variável de instância pública e função pública não servem com \`OpenWithParm\`
  em janela \`response!\`**: não existe instância antes do \`Open\`.
- **Passar dois valores num \`OpenWithParm\`** só funciona com marcador dentro da
  string, com \`Message.PowerObjectParm\` + estrutura global, ou com variável
  global. Escolha o marcador (compila já, sem objeto novo) e registre em risks
  que a alternativa limpa exige criar estrutura no painter — a escolha é do dev.
- **Nunca escreva caractere acentuado direto no fonte**: a exportação alterna
  Latin-1 e UTF-8 e o arquivo corrompe. Use o padrão que já existe no trecho.
- \`char(32766)\` na coluna do .srd não é o limite real, e \`detail(height.autosize)\`
  não é autosize do controle — não conclua nada a partir dessas duas.
- \`BorderStyle\`, \`BackColor\` e geometria são ajustáveis em runtime, e o codebase
  já faz isso: prefira condicionar por fluxo a pedir mudança no painter.`;

export async function runProposal(card: Card): Promise<ProposalResult> {
  if (!card.analysis) {
    throw new Error('proposer: card sem análise prévia');
  }

  const moduleContext = await loadModuleContext(card.module);
  const { skills } = await getSettings(); // skill do time (Configurações > IA)
  const { text: retrieved } = await retrieveContext(card.module, card.analysis.rootCause);

  /*
   * O CÓDIGO REAL dos objetos que a análise apontou, lido do working copy. É a
   * diferença entre propor sobre o que existe e propor sobre o que o modelo
   * imagina: o caminho vem conferido, e o trecho vem do arquivo.
   */
  const material = await gatherSourceMaterial(
    card.module,
    card.analysis.affectedObjects.map((o) => o.name),
    // o chamado entra na busca: o nome da tela costuma estar no texto do
    // suporte e na barra de título do print
    [card.devHints ?? '', card.rawTicket, card.analysis.rootCause, ...card.analysis.reasoning].join(
      '\n',
    ),
  );

  const codeSection =
    material.excerpts.length > 0
      ? material.excerpts
          .map((e) => `## ${e.path}\n\`\`\`\n${e.content}\n\`\`\``)
          .join('\n\n')
      : '(nenhum código encontrado para os objetos citados — não invente caminho ' +
        'nem conteúdo: devolva diff vazio e diga o que precisa ser buscado)';

  /*
   * Quem mais toca os objetos que o diff vai alterar. Sem isto, a proposta
   * corrige o fluxo citado no chamado e deixa o legado intacto (SMART-51229:
   * `w_agd03` corrigido, `m_sheet.mf_buscar_agds` esquecido), ou altera uma
   * janela compartilhada e muda uma tela que ninguém pediu pra mexer.
   */
  const reuse = formatReuseInventory(
    await reuseInventory(card.module, [
      ...card.analysis.affectedObjects.map((o) => o.name),
      ...material.excerpts.map((e) => e.path.slice(e.path.lastIndexOf('/') + 1)),
    ]),
  );

  const userPrompt = [
    `# Chamado ${card.jiraKey}`,
    card.rawTicket,
    card.images?.length
      ? `\n(${card.images.length} screenshot(s) anexado(s) abaixo — leia mensagens de erro, títulos de janela e estado da UI)`
      : '',
    '',
    '# Análise (causa raiz já validada)',
    JSON.stringify(card.analysis, null, 2),
    buildTraceSection(card.traceAnalysis, 'proposta'),
    '',
    '# Código real dos objetos afetados (lido do repositório, com nº de linha)',
    codeSection,
    reuse,
    '',
    '# Contexto do módulo',
    moduleContext,
    '',
    '# Trechos relevantes do codebase (RAG)',
    retrieved,
  ].join('\n');

  // Mesmas ferramentas do analyzer: o proposer é quem mais sofria com trecho
  // cortado, porque diff contra código truncado não aplica.
  const toolset = buildCodeToolset(card.module);

  const { output, usage } = await callJsonAgent(ProposerOutputSchema, {
    system: SYSTEM + buildSkillSection(skills),
    userText: userPrompt,
    // Os prints também vão pro proposer: a mensagem de erro exata e o estado da
    // tela mudam o diff, e antes só o analyzer os enxergava.
    images: card.images,
    ...(toolset ? { tools: toolset.tools, runTool: toolset.runTool } : {}),
    // Mesmo motivo do analyzer, e aqui aperta mais cedo: diff com contexto é
    // caro em token, e a última proposta que passou gastou 6507 de 8000 (81%).
    maxTokens: 16000,
  });

  // Conferência determinística do que o modelo escreveu. `patch` até recusaria
  // na hora de aplicar, mas aí o dev já leu a proposta inteira acreditando nela.
  const targets = [0, 1, 2].flatMap((strip) => parseDiffTargets(output.diff, strip));
  const unknown = await unknownDiffPaths(card.module, [...new Set(targets)]);

  // Só acusa quando NENHUMA variação de strip do caminho existe — o diff pode
  // vir com prefixo a/ b/, e aí a versão -p0 "não existe" legitimamente.
  const realPathCount = new Set(targets).size - unknown.length;
  return {
    output,
    usage,
    unknownPaths: realPathCount > 0 ? [] : unknown,
  };
}
