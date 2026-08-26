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
| `w_agd03` | `agenda50` | window | Agenda (layout novo); `wf_exibir_instrucoes`, `wf_buscar_instrucoes`, `wf_seleciona_horario` |
| `w_agd01` | `agenda50` | window | Agenda (layout **legado**) — segundo ponto de entrada dos mesmos fluxos |
| `m_sheet` | `agenda50` | menu | `mf_buscar_agds` — entrada do fluxo pelo layout legado |
| `d_smk_inst_agd_popup` | `agenda50` | datawindow | Pop-up de instruções do exame |
| `w_exibe_inst` | `osgen50` | window | Pop-up de texto — **compartilhada com o Lab** |
| `w_preview_gen` | `aplgen50` | window | Preview de relatório — **compartilhada com o sistema todo** |
| `w_smk01_n` | — | window | Cadastro de serviço (grava `smk_inst_operador`) |

**Tabelas que aparecem junto:** `smk` (coluna `smk_inst_operador`, tipo `text`,
mas **gravada truncada**), `smkinst` (o texto íntegro — é desta que se lê),
`usr` (`usr_nome`, usado em título de janela).

<!-- Descobertos via PB Insight; confirmar responsabilidade real de cada um. -->

## Armadilhas conhecidas

<!-- O ouro do arquivo. Cada uma economiza uma rodada de análise errada. -->
- **Listas de período são fixas em datawindow**, não vêm do banco: um valor
  faltando (ex.: Domingo) é alteração de objeto, não de dado (ver SMART-51431).
- Diferença de comportamento Oracle vs SQL Server em <!-- preencher -->.
- Objetos de agendamento colidem por nome entre `agenda50` e `aplgen50` —
  conferir a biblioteca certa antes de propor diff (o PB Insight reporta
  ambiguidade quando isso acontece).
- **Todo fluxo da agenda tem DOIS pontos de entrada.** O layout novo entra por
  `w_agd03`; o legado, por `m_sheet.mf_buscar_agds` → `w_agd01`. Corrigir só um
  deixa metade dos operadores com o defeito e o chamado volta (SMART-51229).
- **O pop-up de instruções não é da agenda.** `w_exibe_inst` mora em `osgen50` e
  é usada também pelo Lab (`u_dw_smm_lab.sru:3755`). Alteração ali é condicional
  — no 51229, um marcador opcional `[TITULO]...[/TITULO]` no parâmetro; sem o
  marcador, o Lab se comporta exatamente como antes.
- **Instrução de exame tem duas fontes, e uma delas está truncada.**
  `smk.smk_inst_operador` é gravada com `MID(...,1,2000)` no cadastro de serviço
  (`w_smk01_n.srw:1797`), apesar de a coluna ser `text`. O texto íntegro está em
  `smkinst` — é de lá que os fluxos de exibição devem ler.

## Como validar uma correção

- Reproduzir o cenário do chamado **antes** da mudança (idealmente com pbtrace).
- Aplicar o diff na branch, reproduzir de novo: o cenário não deve mais ocorrer.
- Anexar o trace "antes/depois" como evidência no card (estágio RESOLVIDO).

## Histórico de casos resolvidos

- **SMART-51431** — Domingo ausente no campo Período do limite de atendimento
  (`d_lmc02tab`, lista `lmc_periodo`).
- **SMART-51229** — instruções de exame cortadas no pop-up "Visualizar
  (Instruções)". **Um sintoma, três causas em camadas diferentes:**

  | Camada | Onde | O que acontecia |
  |---|---|---|
  | gravação | `w_smk01_n.srw:1797` | `MID(...,1,2000)` grava `smk_inst_operador` truncado |
  | leitura | `w_agd03.wf_exibir_instrucoes` | lia de `smk.smk_inst_operador` em vez de `smkinst` |
  | exibição | `font_color.srf:787` | troca a fonte **depois** do cálculo de `height.autosize` |

  A cadeia completa, que é o que faltava pra sair do palpite:

  ```
  evento na dw[] do w_agd03
    └─ wf_exibir_instrucoes
         └─ u_ds_print  dataobject = "d_smk_inst_agd_popup"
              └─ OpenWithParm ( w_preview_gen, ... )
                   └─ w_preview_gen.open
                        └─ f_ajusta_win_font_color ( This, 83 )
                             └─ f_ajusta_dw_font_color ( dw_preview, 983 )
                                  └─ font_color.srf:787 → Font.Face = 'Segoe UI'
  ```

  O texto real tinha **5152 caracteres** — contar `LEN()` na gravação, no SELECT
  e no controle foi o que transformou palpite em diagnóstico e deu o critério de
  aceite. Corrigido no ticket: leitura de `smkinst` (`w_agd03` **e**
  `m_sheet.mf_buscar_agds`) e título opcional em `w_exibe_inst`. As camadas de
  gravação e de fonte viraram chamado separado por raio de alcance.
- <!-- preencher os próximos -->
