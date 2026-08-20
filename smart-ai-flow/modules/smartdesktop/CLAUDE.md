# Sistema: SMART Desktop

> Este arquivo é o briefing que a IA recebe em toda análise/proposta de card do
> SMART Desktop. Ele cobre o que vale para o **sistema inteiro**; logo abaixo
> dele, no mesmo prompt, vem o briefing de cada módulo acoplado (ATENDE,
> AGENDA, MWSUS, CADGF). Trate como documento vivo: cada bug bem resolvido vira
> uma linha nova aqui.

## O que é

Sistema desktop em **PowerBuilder / PFC**, entregue como um executável único
que acopla os módulos. O chamado costuma chegar nomeando a tela, não o módulo —
por isso o card não pergunta qual módulo é: identificar isso faz parte da
análise.

## Como descobrir o módulo a partir do chamado

Use os briefings abaixo. Na dúvida, os atalhos que costumam denunciar a origem:

| Pista no chamado | Provável módulo |
|---|---|
| paciente, ordem de serviço (OS), fila de espera, documentos da OS | ATENDE |
| marcação, horário, escala, sala, agendamento | AGENDA |
| SUS, BPA, APAC, faturamento SUS | MWSUS |
| cadastro geral, convênio, tabela de preço, parâmetros | CADGF |

Quando a pista não fecha, diga na análise **qual módulo você assumiu e por quê**
em vez de escolher em silêncio — errar o módulo em silêncio é o que faz a
proposta apontar objeto que não existe.

## Vale para todos os módulos

- **Dois bancos suportados: SQL Server (inclusive SQL Cloud) e Oracle.** Toda
  proposta que mexe em SQL precisa dizer o que acontece nos dois — divergência
  em `NULL`, tipos de data e `stored procedures` é a origem recorrente de
  regressão.
- **Comportamento parametrizado por INI.** Antes de propor mudança de código,
  verifique se o cenário não é um parâmetro (ex.: `CON_MED_FL`).
- **Objetos compartilhados são zona de risco.** `w_main_frame` e o que vive em
  `aplgen50` são usados por todos os módulos: mudança ali sai do escopo do
  chamado e derruba o sistema inteiro. Se a correção parecer exigir isso,
  aponte o risco explicitamente em vez de propor direto.
- **PFC.** Herança e ancestrais próprios do framework: sobrescrever evento sem
  chamar o ancestral quebra comportamento padrão de forma difícil de rastrear.

## Evidência de execução

Chamado com log de **pbtrace** anexado é analisado antes pelo app_trace, e o
diagnóstico dele entra no prompt. Evidência de execução pesa mais que suposição
sobre o código — mas cruze com o resto do contexto antes de fechar a causa raiz.

<!-- preencher: convenções de nomenclatura de objetos, bibliotecas por módulo,
     e as armadilhas que se repetem entre módulos. -->
