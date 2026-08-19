# 04 — Extração de eventos individuais e validação positiva da hipótese de granularidade

> Entregue em 2026-07-24. Ataca diretamente o achado do docs/03: a causa raiz
> de um bug costuma caber num único evento, não no objeto inteiro. Esta
> entrada fecha o loop com uma segunda chamada real ao mesmo ticket,
> convergindo para o mecanismo correto do fix — reportado com o mesmo rigor
> (verificação linha a linha) que o resultado negativo anterior.

## O que existe e funciona

### Extrator de eventos (`extractEventBlocks`)

Format real do export PowerBuilder (confirmado contra o repo): um bloco
`forward...end forward` puramente esquelético (sem corpo), seguido da
declaração real do objeto, variáveis de instância, `forward
prototypes...end prototypes` (só assinaturas), e então a sequência linear de
eventos/funções — pertencentes ao próprio objeto até a primeira linha `type X
from Y within Z` (que troca o "dono" corrente para o controle X até a
próxima).

```
src/domain/entities/pb-object.ts                  PBEventBlock (kind, owner, name, body, startLine, endLine)
src/infrastructure/parsers/event-extractor.ts      extractEventBlocks(source, rootName) — state machine linha-a-linha
src/application/use-cases/find-event/              FindEventUseCase — navegação: objeto+evento(+controle) → corpo
src/interfaces/cli/event.command.ts                npm run event -- <objeto> <evento> [--owner <controle>]
```

Conectado a `WindowParser`, `UserObjectParser` e `FunctionParser` — os três
tipos onde eventos/funções PowerScript reais aparecem (`.srd` não tem, os
eventos de um controle DataWindow vivem na *janela* que o embute, não no
objeto DataWindow em si).

12 testes unitários cobrem: skip de `forward`/`forward prototypes`/`type
variables`, troca de dono, corpo iniciando na mesma linha do `event
nome;call super::nome;`, eventos customizados sem `call super::` (ex.:
`ue_zoom`), `public function`/`global function`/`public subroutine`, e a
reprodução exata da topologia `getfocus`/`retrieveend`/`clicked` citada na
validação do docs/03.

**Validado contra o arquivo real** (fixture com o bug): `w_confirm_agm.srw`
(148.288 chars) produz **79 eventos/funções em 17 donos distintos**. O evento
`zoom` de `dw_agm18tab` isolado tem **9.114 chars** — redução de 16x.

### Diagnóstico direcionado a um evento (`--event`/`--owner`)

`DiagnoseTicketUseCase.prepare()` ganhou um parâmetro `eventFocus` opcional:
quando presente, o dump do objeto raiz vira só o corpo do evento casado (via
`FindEventUseCase`), mantendo ancestrais/DataWindows conforme `relationTypes`
(que agora também aceita `none` para zerar tudo). `--relations none --event
X --owner Y` é o teste mais estrito possível: nem grafo, nem objeto inteiro —
só o evento suspeito.

```sh
npm run diagnose -- w_confirm_agm --ticket t.txt --event zoom --owner dw_agm18tab --relations none
```

## Re-validação do mesmo ticket (SMART-51352) com evento isolado

Mesma metodologia do docs/03 (fixture isolado, leitura apenas do
`ws_objects`, sem git). Desta vez o contexto enviado foi **só o corpo do
evento `zoom` de `dw_agm18tab`** (mais o ancestral `w_sheet_gen` por completo,
já que ele ainda não tem targeting por evento) — 16 KB, ~4.150 tokens
estimados, contra 884 KB / ~226K tokens da rodada anterior.

**Resultado: convergência com o mecanismo real do fix**, verificada linha a
linha contra o diff confirmado:

| | Correção sugerida pelo modelo | Fix real (git diff) |
|---|---|---|
| Mecanismo | "reposicionar a linha corrente ao final **independentemente de o registro pertencer ou não a um agrupador**" | mover `This.ScrollToRow(nSelRow)` para **fora** do `IF NOT isnull(nAgmGSerie)…END IF` |

Mesmo objeto, mesmo evento, mesma causa raiz estrutural — "sucesso forte"
pelo critério original do experimento (`teste-minimo`): *"o modelo aponta o
mesmo objeto/campo/linha... ou algo estruturalmente equivalente"*.

Diferença notada, não escondida: o modelo também sugeriu adicionar uma
checagem `IF nSelRow > 0` após o `Find`, que o fix real não tem — é uma
robustez a mais, não uma discordância sobre a causa raiz. Confiança reportada
ficou em Média/Baixa novamente (pediu os eventos `clicked`/`rowfocuschanged`
e o `pbtrace.log` para elevar a certeza) — calibração consistente com as
rodadas anteriores, mesmo tendo acertado o mecanismo desta vez.

### Comparação das três rodadas no mesmo ticket

| Rodada | Contexto enviado | Tamanho | Custo | Resultado |
|---|---|---|---|---|
| 2 (teste-minimo) | objeto raiz inteiro | 148 KB | — (Sonnet 5) | Causa errada (dessync de foco) |
| 3 (docs/03) | raiz + ancestrais + DataWindows (grafo completo) | 884 KB / ~226K tokens | ~US$ 2,52 | Causa errada, porém grounded (getfocus/retrieveend/clicked reais) |
| **4 (esta entrada)** | **só o evento `zoom` isolado** + ancestral | 16 KB / ~4.150 tokens | **~US$ 0,24** | **Mecanismo correto** (ScrollToRow incondicional) |

A rodada 4 é ao mesmo tempo **mais barata que a 2** (que não tinha grafo
nenhum, só não tinha isolamento de evento) **e mais precisa que a 3** (que
tinha grafo completo, mas objeto inteiro). Isso confirma diretamente a
reinterpretação do docs/03: o gargalo real era granularidade do conteúdo, não
quantidade de objetos relacionados.

## Decisões registradas

1. **Ancestrais continuam sendo dumpados por inteiro**, não por evento — só o
   objeto *raiz* (o alvo direto do chamado) ganhou granularidade de evento
   nesta entrega. Extrapolar para ancestrais/DataWindows é natural, mas fica
   para quando a evidência pedir (o `w_sheet_gen` deste caso era pequeno o
   suficiente para não ser o gargalo).
2. **`FindEventUseCase` retorna todas as ocorrências, não força escolha
   única** — quando dois controles têm evento de mesmo nome (ex.: `clicked`
   em duas DataWindows diferentes), a ambiguidade é do usuário resolver via
   `--owner`, não do sistema adivinhar.
3. **`--relations none` como opção explícita**, não como comportamento padrão
   de `--event` — evitar mudar o padrão silenciosamente quando o usuário passa
   `--event`; ele decide se quer zerar o grafo ou mantê-lo.
4. **Reportar "sucesso forte" com o mesmo rigor do resultado negativo
   anterior** — verifiquei o mecanismo citado pelo modelo contra o diff real
   antes de classificar como acerto, e nomeei explicitamente onde a sugestão
   do modelo diverge do fix real (o `IF nSelRow > 0` extra), em vez de
   arredondar para "bateu 100%".

## Limitações conhecidas

- Ainda n=1 (mesmo ticket, testado 3 vezes com contextos diferentes) — a
  regra de 2-3 chamados diferentes antes de generalizar continua de pé.
- O usuário precisa saber (ou descobrir via `npm run event` explorando)
  *qual* evento é suspeito para usar `--event`/`--owner` — não há ainda
  detecção automática de "qual evento provavelmente contém o bug" a partir do
  texto do chamado. Isso é candidato natural a um próximo incremento (ex.:
  cruzar palavras-chave do chamado com nomes/corpos de evento via o índice de
  busca).
- `extractEventBlocks` é heurística de linha (não AST): funções com lista de
  parâmetros quebrada em múltiplas linhas antes do `);` não são reconhecidas
  corretamente. Não observado nos casos reais testados até agora.

## Próximos passos

- Busca por palavra-chave dentro de corpos de evento (não só `uiStrings`) —
  é o pedido explícito do usuário ("digitar palavra-chave e o backend
  retornando onde está"), natural extensão do `InMemoryUIStringIndex` ou um
  índice irmão.
- Expor eventos/funções como unidade navegável de primeira classe pensando
  no frontend futuro (árvore objeto → controles → eventos, não só
  objeto → texto bruto).
- Rodar 2-3 chamados diferentes (conforme já combinado) antes de qualquer
  conclusão mais ampla sobre a hipótese de granularidade.
