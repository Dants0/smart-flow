# Módulo: AGENDA

> Este arquivo é o briefing que a IA recebe em toda análise/proposta deste
> módulo. Quanto mais preciso, menos alucinação. Trate como documento vivo:
> cada bug bem resolvido vira uma linha nova aqui.

## Visão geral

Módulo de agendamento do SMART Desktop: marcação, confirmação de agendamento
e limites de atendimento por convênio/período.

<!-- preencher: escopo funcional completo, telas principais, quem usa -->

## Stack e ambiente

- PowerBuilder / PFC
- Bancos: **SQL Server** e **Oracle** — atenção a diferenças de SQL, tipos de
  data e comportamento de `stored procedures`.
- Parâmetros de comportamento via **INI** <!-- documentar os deste módulo -->

## Objetos-chave

| Objeto | Biblioteca | Tipo | Responsabilidade |
|--------|-----------|------|------------------|
| `w_confirm_agm` | `agenda50/ag_conf` | window | Confirmação de agendamento |
| `d_agm05tab` | `agenda50/ag_conf` | datawindow | Aba de dados do agendamento |
| `d_dlg01tab_agm` | `agenda50/ag_conf` | datawindow | Diálogo de documentos |
| `w_valid_doc` | `agenda50/ag_conf` | window | Validação de documento |
| `d_lmc02tab` | `agenda50` | datawindow | Limite de atendimento por período |

<!-- Descobertos via PB Insight; confirmar responsabilidade real de cada um. -->

## Armadilhas conhecidas

<!-- O ouro do arquivo. Cada uma economiza uma rodada de análise errada. -->
- **Listas de período são fixas em datawindow**, não vêm do banco: um valor
  faltando (ex.: Domingo) é alteração de objeto, não de dado (ver SMART-51431).
- Diferença de comportamento Oracle vs SQL Server em <!-- preencher -->.
- Objetos de agendamento colidem por nome entre `agenda50` e `aplgen50` —
  conferir a biblioteca certa antes de propor diff (o PB Insight reporta
  ambiguidade quando isso acontece).

## Como validar uma correção

- Reproduzir o cenário do chamado **antes** da mudança (idealmente com pbtrace).
- Aplicar o diff na branch, reproduzir de novo: o cenário não deve mais ocorrer.
- Anexar o trace "antes/depois" como evidência no card (estágio RESOLVIDO).

## Histórico de casos resolvidos

- **SMART-51431** — Domingo ausente no campo Período do limite de atendimento
  (`d_lmc02tab`, lista `lmc_periodo`).
- <!-- preencher os próximos -->
