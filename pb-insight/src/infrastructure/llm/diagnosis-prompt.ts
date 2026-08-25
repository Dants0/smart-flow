import type { DiagnosticContext } from "../../application/ports/llm-client.port.js";

/**
 * Mesmo template validado manualmente no experimento teste-minimo (ver
 * pb-insight/../teste-minimo), adaptado para receber contexto de múltiplos
 * objetos (root + ancestrais + dependências) em vez de um único arquivo.
 */
export function buildDiagnosisPrompt(context: DiagnosticContext): string {
  const imagesNote = context.images?.length
    ? `\n\n--- EVIDÊNCIA VISUAL ---\n${context.images.length} imagem(ns) anexada(s) junto a esta mensagem (screenshot da tela/erro relatado). Considere-a(s) como evidência adicional ao lado do código — cite o que aparece nelas quando relevante para o diagnóstico.`
    : "";

  /**
   * Sem esta seção o modelo responde só sobre o objeto raiz mesmo tendo os
   * irmãos no contexto — foi o que produziu o diagnóstico de 1 janela no
   * SMART-50927 quando 6 tinham o mesmo defeito. O bloco só aparece quando
   * há irmãos no dump; pedir abrangência sem material para comparar convida
   * o modelo a inventar arquivos.
   */
  const scopeSection = context.siblingCount
    ? `
Abrangência (obrigatória — o contexto traz ${context.siblingCount} outra(s) ocorrência(s) do mesmo evento):
  liste explicitamente quais delas têm o MESMO defeito e quais já estão corretas, com objeto e linha, e diga
  o que distingue as duas listas. Corrigir só o objeto citado no chamado deixa o bug em produção nas demais.
  Considere apenas os objetos presentes no contexto — não deduza nem invente arquivos que não foram fornecidos.`
    : "";

  const techLeadNote = context.techLeadComment?.trim()
    ? `\n\n--- COMENTÁRIO DO TECH LEAD ---\n${context.techLeadComment.trim()}\n\nEsta é uma pista de um humano com contexto do sistema, não um fato confirmado — use-a para direcionar a investigação (ex.: onde olhar primeiro), mas verifique contra o código fornecido antes de aceitá-la. Se o código contradisser o comentário, diga isso explicitamente em vez de forçar a hipótese do tech lead.`
    : "";

  return `Você é um desenvolvedor sênior de PowerBuilder analisando um chamado de bug num sistema de gestão hospitalar legado (SMART Desktop).

Abaixo está o código-fonte do objeto relacionado ao chamado, seguido de seus ancestrais e dependências diretas (extraídos automaticamente do grafo de dependências)${
    context.siblingCount ? ", depois as outras ocorrências do mesmo evento no restante do sistema" : ""
  }, e por fim a descrição do chamado.

Sua tarefa: identificar a causa raiz mais provável do problema, citando o trecho específico do código que sustenta esse diagnóstico. Se o código fornecido não for suficiente para ter certeza, diga isso explicitamente em vez de arriscar um palpite — declare quais outros objetos ou informações seriam necessários para confirmar.

Formato de resposta:
Causa raiz:
Correção sugerida:
Evidência (trecho do código):${scopeSection}
Confiança (Alta / Média / Baixa) e por quê:

--- CONTEXTO DE CÓDIGO (objeto + ancestrais + dependências diretas) ---
${context.objectContext}

--- CHAMADO ---
${context.ticketText}${techLeadNote}${imagesNote}`;
}
