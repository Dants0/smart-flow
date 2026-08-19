# 02 — Índice de UI-strings e versionamento (diff de snapshots)

> Entregue em 2026-07-24. Cobre o restante do passo 3 (SPEC §13: índice de
> UI-strings consultável) e o passo 4 (versionamento: snapshots + diff sob
> demanda). Ambos validados contra o repositório real.

## O que existe e funciona

### Índice de UI-strings (`npm run search`)

Resolve o problema central descrito no SPEC §1/§12: ligar o texto que o
suporte digita ("campo Período") ao objeto real (`d_lmc02tab`), sem depender
do LLM adivinhar nomes técnicos.

```sh
npm run search -- "Período" --limit 10
```

Validação real: a busca por `"Período"` no `ws_objects` completo retorna
`agenda50/agenda50/d_lmc02tab` entre os 10 primeiros resultados — o mesmo
objeto do exemplo do SPEC §12 (`BLOQUEAR CONVENIO NO DOMINGO`).

Busca é tolerante a acento e caixa (`normalizeText`: NFD + strip de marcas
combinantes + lowercase) — `"periodo"`, `"Período"` e `"PERÍODO"` casam igual.
Resultado ordenado por tamanho do match (string mais curta primeiro), então um
match exato ("Período") aparece antes de um mais genérico
("Confirmar Período de Faturamento").

Implementação: varredura linear em memória sobre todas as `uiStrings` já
extraídas na ingestão (~algumas dezenas de milhares de strings no repo
inteiro). Não há índice invertido de tokens — não é necessário no volume atual
(a varredura no grafo completo responde em milissegundos).

### Diff de versões (`npm run diff`)

Endereça diretamente o fluxo que você descreveu: *"sempre darei pull antes...
e daí passaria o problema"*. Cada `npm run ingest` agora grava, além do
`graph.json` "atual", uma cópia histórica em `.data/snapshots/`. O `diff`
compara dois desses snapshots por `content_hash` — sem precisar reprocessar
texto, é comparação de hash O(n).

```sh
npm run diff -- --list                              # snapshots disponíveis, mais recente primeiro
npm run diff -- --from .data/snapshots/<antigo>.json                 # compara contra o grafo atual
npm run diff -- --from <a> --to <b>                                  # compara dois snapshots específicos
npm run diff -- --from <a> --only modified --contains agm            # filtra por tipo de mudança / nome
```

Validação real: gerei um snapshot manual do estado atual, rodei `npm run
ingest` de novo (fonte inalterado) e o diff reportou corretamente **zero
diferenças** nos 15.928 objetos — sem falso positivo.

## Estrutura adicionada

```
src/
  domain/
    entities/object-diff.ts            ObjectDiffEntry (added|removed|modified)
    services/diff-object-snapshots.ts  regra pura: compara dois PBObject[] por content_hash
    value-objects/normalize-text.ts    NFD + strip de acento + lowercase
  application/
    ports/ui-string-index.port.ts      IUIStringIndex
    use-cases/
      search-ui-strings/               casca fina sobre o índice
      diff-versions/                   casca fina sobre a regra pura de domínio
  infrastructure/
    search/in-memory-ui-string-index.ts   varredura linear em memória
  interfaces/cli/
    search.command.ts
    diff.command.ts
```

`IObjectRepository` ganhou `allObjects()` — necessário tanto para construir o
índice de UI-strings quanto para o diff (que compara arrays de `PBObject`
carregados de dois snapshots independentes).

## Decisões registradas

1. **Diff é comparado por `id` (library/name), não por conteúdo.** Um objeto
   que só mudou de PBL aparece como `removed` + `added` — é de fato uma
   mudança estrutural (outro caminho, possivelmente outro dono), não uma
   edição no lugar. Consistente com a decisão já registrada de `id` incluir a
   PBL.
2. **`diffObjectSnapshots` é função pura de domínio, sem I/O.** Recebe dois
   arrays de `PBObject` já carregados — os testes não precisam de fixture em
   disco. O use case (`DiffVersionsUseCase`) é casca fina só para manter o
   mesmo padrão de orquestração dos demais; a regra em si vive no domínio,
   como pede a arquitetura (SPEC §4).
3. **Snapshot histórico é uma cópia de arquivo, não um formato novo.** O
   `ingest` grava o mesmo JSON já produzido em `.data/snapshots/<label
   normalizado>-<versionId>.json`. Simples e suficiente para o volume atual;
   quando o Postgres entrar (SPEC §7), os snapshots viram linhas em
   `codebase_versions` + `pb_objects`, e o diff sob-demanda passa a comparar
   `content_hash` via SQL em vez de carregar dois JSONs — a regra pura de
   domínio (`diffObjectSnapshots`) não muda, só o adapter que a alimenta.
4. **`--list` em vez de heurística de "snapshot anterior" automática.** Cheguei
   a cogitar escolher automaticamente o penúltimo snapshot como `--from`
   default, mas isso esconde qual comparação está sendo feita — melhor listar
   e deixar explícito. Único default é `--to` = grafo atual (`.data/graph.json`),
   que é o caso de uso mais comum ("o que mudou desde o snapshot X até agora").
5. **Índice de UI-strings reconstruído em memória a cada consulta**, não
   persistido. Construir a partir de `allObjects()` já carregado do JSON leva
   frações de segundo mesmo com 16k objetos — persistir o índice seria
   otimização prematura.

## Limitações conhecidas

- A busca não distingue o *contexto* da string (label de coluna vs. título de
  janela vs. texto de botão) — o extrator já mescla tudo em `uiStrings` sem
  guardar a origem. Suficiente para achar candidatos; se a busca por contexto
  virar necessária (ex.: "só títulos de janela"), a extração precisa separar
  por atributo (`text=` vs `title=`) antes de guardar.
- Diff no nível de objeto inteiro, não de linha/trecho. Para saber *o que*
  mudou dentro de um objeto marcado como `modified`, ainda é preciso reler o
  fonte (via `--dump` do `context.command.ts`) e comparar manualmente — um
  diff textual por objeto é a extensão natural quando isso virar necessidade
  recorrente.
- `.data/snapshots/` cresce sem limite (um arquivo ~35 MB por ingestão). Sem
  política de retenção ainda — aceitável no volume atual de uso pessoal.

## Próximos passos (ordem do SPEC §13)

- **5–6.** Ingestão de tickets históricos + embeddings + `ticket_object_links`
  — é o próximo passo que dá ao motor de diagnóstico o RAG de chamados
  similares.
- **7.** Motor de diagnóstico: já dá para montar manualmente hoje combinando
  `search` (achar candidato) → `context --dump` (contexto grounded) → o
  `test.ts` do teste-minimo (síntese via Claude). Orquestrar isso como use
  case único é o próximo salto natural.
