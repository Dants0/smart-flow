# 16 — Abrangência do diagnóstico (janelas irmãs)

> Pedido em 2026-08-24, motivado pelo chamado SMART-50927: o diagnóstico
> apontou 1 janela (`w_sismama_citopatologico`) quando 6 tinham exatamente o
> mesmo defeito. O tech lead reproduziu o mesmo chamado num Claude Code com
> acesso ao repositório inteiro e achou as demais com `grep`.

## O buraco

`DiagnoseTicketUseCase.prepare()` monta o contexto ancorado num **único
objeto**: raiz (ou um evento isolado dele) + ancestrais + 1 salto de
`embeds`/`references`. Janelas que sobrescrevem o mesmo evento do mesmo tipo
de controle **não têm aresta entre si** — compartilham só o ancestral do
controle (`u_dw_pac`). Elas nunca entravam no dump, então o modelo não tinha
como citá-las. Não foi alucinação nem preguiça do LLM: o material não estava
lá.

Some a isso o prompt, que pedia causa raiz e correção mas nunca **escopo** —
mesmo com as irmãs no contexto, o formato de resposta não dava lugar para
elas.

## O que mudou

- `FindPatternSiblingsUseCase` — dado (objeto raiz, controle, evento), acha
  todas as outras ocorrências daquele evento em controles do **mesmo tipo**
  (e dos tipos que herdam dele) no ws_objects inteiro. Sem reler fonte:
  `structured.controls` e `structured.events` já estão no snapshot.
- `prepare()` ganha um 5º parâmetro `PrepareOptions` (`maxSiblings`,
  `siblingBodyChars`) e passa a anexar o bloco
  `--- OUTRAS OCORRÊNCIAS DO MESMO EVENTO ---` ao `objectContext`. Só com
  `eventFocus`: sem um evento em foco não existe "mesmo evento" a comparar.
- Prompt: seção `Abrangência:` no formato de resposta, condicional a
  `siblingCount > 0`, exigindo separar "mesmo defeito" de "já correta" com
  objeto e linha — e proibindo extrapolar para arquivos ausentes do contexto.
- `POST /diagnose` aceita `maxSiblings` e devolve `context.siblings[]` +
  `context.siblingsTruncated`; a CLI ganha `--max-siblings` e lista as
  ocorrências antes de gastar token (visível no `--dry-run`).
- `GET /objects/:name/events/:eventName/siblings?owner=&limit=` — o mesmo
  levantamento como endpoint próprio, com o corpo de cada ocorrência.

## Por que também um endpoint, e não só o `POST /diagnose`

A esteira (`smart-ai-flow`) **não usa** o `POST /diagnose`: ela monta o
contexto por conta própria via `/search` + `/objects/:name/events/:eventName`
e roda os agentes `analyzer`/`proposer` com prompt próprio (ver
`smart-ai-flow/src/infra/pbInsight.ts`). Corrigir só o `prepare()` deixaria
justamente o caminho que atendeu o SMART-50927 sem o conserto. O endpoint é o
que a esteira consegue consumir; ela chama `/siblings` para cada evento que
entra no contexto e monta a seção "Mesmo evento em outros objetos
(abrangência)", com teto global de 12 ocorrências e 1500 chars cada.

Do lado dos agentes, o `analyzer` passou a ser obrigado a colocar em
`affectedObjects` **todos** os objetos com o defeito (não só o citado no
chamado), e o `proposer` a entender "cirúrgico" como tamanho do hunk, não
número de arquivos — o diff tem que cobrir todos. Sem essas duas regras o
contexto chegava e a resposta continuava falando de um objeto só.

## Busca por tipo, não por nome

`dw_pac01tab` é convenção, não regra: as mesmas telas usam `dw_pac01`,
`dw_pac01ff`, `dw_pac`. Procurar pelo nome do controle perderia essas. A
busca é sobre `fromType` — e inclui os descendentes por herança
(`u_dw_pac_assist`), senão um objeto com o mesmo defeito ficaria de fora do
relatório de abrangência só por usar uma especialização do controle.

## Teto, ordem e dedupe (achados no dado real, não nos testes)

Os dois primeiros `--dry-run` contra o grafo de verdade mostraram problemas
que a topologia sintética dos testes não expunha:

- **Duplicatas.** O fonte exportado declara cada controle duas vezes (forward
  declaration no topo + bloco real), então `structured.controls` traz o mesmo
  controle repetido — cada irmã aparecia duas vezes e comia o dobro do teto.
  Dedupe por nome de controle dentro de cada objeto.
- **O teto cortava justamente o módulo do chamado.** Ordenar por id e cortar
  em 40 descartava todo o `mwsus` (as 47 ocorrências reais começam em
  `agenda50`). Ordem passou a ser **mesma PBL primeiro**, depois por id:
  "mesma biblioteca" é o proxy mais direto de "mesmo módulo, mesma família de
  telas", que é o que precisa sobreviver ao corte.

O corte do corpo de cada irmã é pelo **fim** (`DEFAULT_SIBLING_BODY_CHARS`,
2000): a guarda que distingue "já corrigida" de "com o defeito" é sempre
cláusula de entrada do evento, mora nos primeiros caracteres.

## Verificado

Contra o grafo real (`.data/graph.json`), reproduzindo o SMART-50927:

```
npm run diagnose -- w_sismama_citopatologico --ticket t.txt \
  --event avancar --owner dw_pac01tab --relations none --dry-run
```

O bloco de abrangência passou a listar, no topo, as 7 ocorrências de
`mwsus` — `w_apac:7773` (a que **já tem** a guarda, o contraexemplo que o
modelo precisa para separar as duas listas), `w_lea_aih:150`,
`w_siscolo_citopatologico:211`, `w_siscolo_histopatologico:174`,
`w_sismama_citopatologico0:187`, `w_sismama_histopatologico:191`,
`w_sismama_mamografia:248` — todas com linha batendo com uma varredura
independente por `grep` no ws_objects.

E o endpoint, com o servidor de verdade no ar sobre o grafo real:

```
GET /objects/w_sismama_citopatologico/events/avancar/siblings?owner=dw_pac01tab&limit=12
```

devolveu as 7 do `mwsus` primeiro (`w_apac` com a guarda, as outras 6 sem) e
depois as do `agenda50` — e `controlTypes` veio só com `u_dw_pac`, correto:
`u_dw_pac_assist` herda de `u_datawindow_padrao`, não de `u_dw_pac`.
