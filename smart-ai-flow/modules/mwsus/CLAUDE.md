# Módulo: MWSUS

> Este arquivo é o briefing que a IA recebe em toda análise/proposta deste
> módulo. Quanto mais preciso, menos alucinação. Trate como documento vivo:
> cada bug bem resolvido vira uma linha nova aqui.
>
> **Status: esqueleto.** Ninguém preencheu o conteúdo específico ainda — a IA
> vai analisar chamados deste módulo com contexto genérico até isso mudar. Se
> um card de MWSUS vier com análise fraca, é aqui que se corrige.

## Visão geral

<!-- O que é o MWSUS dentro do SMART, que fluxo de negócio cobre (faturamento
     SUS?), quem são os usuários. -->
(preencher)

## Stack e ambiente

- PowerBuilder / PFC
- Bancos: **SQL Server** e **Oracle** — atenção a diferenças de SQL, tipos de
  data e comportamento de `stored procedures`.
- Parâmetros de comportamento via **INI** <!-- documentar os deste módulo -->
- <!-- Integrações externas / layouts obrigatórios do SUS, se houver -->

## Objetos-chave

<!-- Descubra com `GET /search?q=<termo>` no PB Insight e liste aqui os que
     mais aparecem em chamados. Isso ancora o RAG e reduz busca às cegas. -->

| Objeto | Biblioteca | Tipo | Responsabilidade |
|--------|-----------|------|------------------|
| (preencher) | | window | |
| (preencher) | | datawindow | |

## Armadilhas conhecidas

<!-- O ouro do arquivo. Cada uma economiza uma rodada de análise errada. -->
- (preencher)

## Como validar uma correção

- Reproduzir o cenário do chamado **antes** da mudança (idealmente com pbtrace).
- Aplicar o diff na branch, reproduzir de novo: o cenário não deve mais ocorrer.
- Anexar o trace "antes/depois" como evidência no card (estágio RESOLVIDO).

## Histórico de casos resolvidos

<!-- Referência rápida pra IA reconhecer padrões recorrentes. -->
- (preencher)
