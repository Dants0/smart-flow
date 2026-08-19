# Módulo: SMARTWEB

> Este arquivo é o briefing que a IA recebe em toda análise/proposta deste
> módulo. Quanto mais preciso, menos alucinação. Trate como documento vivo:
> cada bug bem resolvido vira uma linha nova aqui.

## Visão geral

<!-- O que é o SMARTWEB dentro do SMART, que fluxo de negócio ele cobre,
     quem são os usuários (recepção, laboratório, faturamento...). -->
Módulo web do SMART. (preencher: escopo funcional, telas principais)

## Stack e ambiente

- PowerBuilder / PFC
- Bancos: **SQL Server** e **Oracle** — atenção a diferenças de SQL, tipos
  de data e comportamento de `stored procedures` entre os dois.
- Parâmetros de comportamento via **INI** (documentar os que afetam este módulo).

## Convenções do time

- Branch: o dev cria manualmente a partir do `main` atualizado.
- PR: seguir as convenções do time (TortoiseGit). Referenciar sempre o Jira key.
- Mudanças **cirúrgicas** — não reescrever objetos inteiros.

## Objetos-chave

<!-- Liste os objetos que mais aparecem em chamados: windows, datawindows,
     NVOs, procedures. Isso ancora o RAG e reduz busca às cegas. -->
| Objeto | Tipo | Responsabilidade |
|--------|------|------------------|
| (preencher) | window | |
| (preencher) | datawindow | |
| (preencher) | nvo | |

## Armadilhas conhecidas

<!-- O ouro do arquivo. Cada uma economiza uma rodada de análise errada. -->
- Diferença de comportamento Oracle vs SQL Server em (preencher).
- Conversão de trace UTF-16LE ao ler pbtrace (ver pbtrace-tool).
- (preencher)

## Como validar uma correção

- Reproduzir o cenário do chamado **antes** da mudança (idealmente com pbtrace).
- Aplicar o diff na branch, reproduzir de novo: o cenário não deve mais ocorrer.
- Anexar o trace "antes/depois" como evidência no card (estágio RESOLVIDO).

## Histórico de casos resolvidos

<!-- Referência rápida pra IA reconhecer padrões recorrentes. -->
- SMART-51845 — configuração de confirmação por e-mail no laboratório.
- (bug de recálculo de prazo de exame — transição de status do item da OS)
- (preencher os próximos)
