# Módulo: ATENDE

> Este arquivo é o briefing que a IA recebe em toda análise/proposta deste
> módulo. Quanto mais preciso, menos alucinação. Trate como documento vivo:
> cada bug bem resolvido vira uma linha nova aqui.

## Visão geral

Módulo de atendimento do SMART Desktop: cadastro/alteração de paciente, ordens
de serviço (OS), documentos anexados à OS e fila de espera.

<!-- preencher: escopo funcional completo, quem usa (recepção, faturamento) -->

## Stack e ambiente

- PowerBuilder / PFC
- Bancos: **SQL Server** (inclusive SQL Cloud) e **Oracle** — atenção a
  diferenças de SQL, tipos de data e comportamento de `stored procedures`.
- Parâmetros de comportamento via **INI** — ex.: `CON_MED_FL` controla o
  destaque de paciente na fila de espera do médico (ver SMART-51531).

## Navegação típica (aparece na maioria dos chamados)

- **F4** abre a tela de pesquisa de paciente.
- **F11 / ZOOM** abre o detalhe/edição do registro selecionado.
- OS → aba **Documentos** lista os anexos do paciente.

## Objetos-chave

| Objeto | Biblioteca | Tipo | Responsabilidade |
|--------|-----------|------|------------------|
| `w_atende` | `atende50/repaca50` | window | Janela principal do atendimento |
| `d_lmc02tab` | `agenda50` | datawindow | Limite de atendimento (lista `lmc_periodo`) |
| `d_agm09tab` | `aplgen50/aplg50_1` | datawindow | Aba de documentos (verificar) |

<!-- preencher: os objetos que mais aparecem em chamados deste módulo.
     Use `GET /search?q=<termo>` no PB Insight pra descobrir o caminho real. -->

## Armadilhas conhecidas

<!-- O ouro do arquivo. Cada uma economiza uma rodada de análise errada. -->
- **Filtro de documentos por paciente**: a aba Documentos da OS já exibiu anexos
  de outros pacientes (SMART-51888). Ao mexer em consulta de anexo, conferir se
  o `WHERE` amarra paciente **e** OS — não só um dos dois.
- **Gravação de alteração de paciente** apresentou erro em tela na 26.3.00.A
  impedindo salvar (SMART-51906) — regressão de versão, reproduzível em base
  local mas não na base padrão Pixeon.
- Diferença de comportamento Oracle vs SQL Server em <!-- preencher -->.

## Como validar uma correção

- Reproduzir o cenário do chamado **antes** da mudança (idealmente com pbtrace).
- Aplicar o diff na branch, reproduzir de novo: o cenário não deve mais ocorrer.
- Anexar o trace "antes/depois" como evidência no card (estágio RESOLVIDO).

## Histórico de casos resolvidos

- **SMART-51431** — "Domingo" não aparecia no campo Período do limite de
  atendimento. Correção: incluir Domingo (1) na lista `lmc_periodo` da
  datawindow `d_lmc02tab` (repac50).
- **SMART-51531** — fila não mudava a cor do nome do paciente. Correção não foi
  código: parâmetro `CON_MED_FL` precisava estar como `N`.
- **SMART-51888** — aba Documentos exibindo anexos de outros pacientes.
- **SMART-51906** — erro ao gravar alteração de dados do paciente (26.3.00.A).
