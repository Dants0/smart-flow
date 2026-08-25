import { callJsonAgent } from './jsonCall';
import { retrieveContext } from '../infra/pbInsight';
import { loadModuleContext } from '../infra/moduleContext';
import { getSettings } from '../infra/settingsRepository';
import { unknownDiffPaths } from '../infra/objectIndex';
import { gatherSourceMaterial } from '../infra/sourceExcerpts';
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
- Só altere FONTES EXPORTADOS: .sru, .sra, .srd, .srw. Nunca proponha mudança em
  .pbl, .pbw ou .pbd — são artefatos de build, não entram em commit, e a
  plataforma recusa o diff se você tocar num deles.
- Em risks, liste efeitos colaterais (Oracle vs SQL Server, INI, DataWindow).`;

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
    '',
    '# Contexto do módulo',
    moduleContext,
    '',
    '# Trechos relevantes do codebase (RAG)',
    retrieved,
  ].join('\n');

  const { output, usage } = await callJsonAgent(ProposerOutputSchema, {
    system: SYSTEM + buildSkillSection(skills),
    userText: userPrompt,
    // Os prints também vão pro proposer: a mensagem de erro exata e o estado da
    // tela mudam o diff, e antes só o analyzer os enxergava.
    images: card.images,
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
