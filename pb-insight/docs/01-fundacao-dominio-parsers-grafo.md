# 01 — Fundação: domínio, parsers heurísticos e grafo de dependências

> Entregue em 2026-07-24. Cobre os passos 1 e 2 da ordem de construção (SPEC §13),
> mais o embrião do passo 3 (UI-strings e conteúdo de DataWindow já extraídos).

## O que existe e funciona

Validado contra o repositório real (`ws_objects` do smart_desktop):

| Métrica | Valor |
|---|---|
| Objetos parseados | 15.928 (0 ignorados) |
| Arestas do grafo | 45.977 |
| Tempo de ingestão completa | ~40s |
| Testes unitários | 19, todos verdes |

Consulta de validação (`npm run context -- w_confirm_agm`): resolve corretamente
o ancestral `w_sheet_gen`, o `u_datawindow_padrao` embutido (que mora em
`aplgen50/aplg50_1` — outra PBL, exatamente a lacuna que fez o teste-minimo
errar a causa raiz), os 14 dataobjects, as 25 janelas abertas, as ~40 funções
globais chamadas e os 7 dependentes reversos (menus e janelas que a abrem).

## Estrutura

```
src/
  domain/
    entities/          pb-object, object-dependency, codebase-version
    value-objects/     pb-object-type (extensão→tipo), result
  application/
    ports/             IPBObjectParser, IDependencyExtractor, IObjectRepository,
                       ISourceFileProvider
    use-cases/
      ingest-codebase-version/   varre → parseia → extrai arestas → persiste
      query-object-context/      objeto → ancestrais + N hops + dependentes
  infrastructure/
    parsers/           base-parser (Template Method), window, userobject,
                       datawindow, function, simple-parsers (menu/structure/...),
                       parser-registry, heuristic-dependency-extractor,
                       powerscript-source (helpers do formato de export)
    persistence/       json-object-repository (Map em memória + JSON em disco)
    filesystem/        fs-source-file-provider (leitura recursiva, SEM git)
  interfaces/cli/      ingest.command, context.command, shared
```

## Uso

```sh
# Após o git pull manual do usuário no smart_desktop:
npm run ingest                       # raiz padrão: C:\controle de versão\smart_desktop\ws_objects
npm run ingest -- <raiz> --label 26.2.03 --out .data/graph.json

npm run context -- w_confirm_agm                 # ancestrais + 2 hops + dependentes
npm run context -- w_confirm_agm --hops 1 --dump contexto.txt
```

`--dump` concatena os fontes do objeto + ancestrais + relacionados de 1º salto
num único arquivo — é a ponte direta para o prompt de diagnóstico (teste-minimo).

## Arestas extraídas (heurística + validação contra índice)

| Tipo | Origem no fonte | Falso positivo controlado por |
|---|---|---|
| `inherits` | `global type X from Y` | Y precisa existir no snapshot |
| `embeds` | `type ctl from u_x within X` | u_x precisa existir (filtra built-ins como commandbutton) |
| `references` | `dataobject="d_x"` | d_x precisa ser DataWindow conhecida |
| `opens` | `Open/OpenSheet/OpenWithParm(w_x` | w_x precisa ser Window conhecida |
| `function_call` | `identificador(` no corpo | identificador precisa ser Function (.srf) conhecida |

A validação contra o índice de objetos conhecidos é o que torna a heurística
segura: um identificador local ou tipo built-in nunca vira aresta.

Colisão de nome entre PBLs: resolução prefere a mesma PBL do objeto de origem;
`query-object-context` reporta ambiguidades encontradas.

## Decisões registradas

1. **Map/hash + listas de adjacência, não árvore binária/AVL.** A relação entre
   objetos é um grafo dirigido muitos-para-muitos (com ciclos possíveis), não
   uma árvore. Lookup é por nome exato → `Map` O(1) supera AVL O(log n). No
   Postgres futuro, índices B-tree vêm do banco.
2. **Snapshot não embute o fonte (`rawContent`).** Guarda `filePath` +
   `contentHash`; o texto é relido do ws_objects sob demanda (`--dump`). Mantém
   o `graph.json` em ~18 MB em vez de ~300 MB. O `contentHash` já deixa pronta
   a detecção de mudança do versionamento (SPEC §7).
3. **Encoding: leitura como UTF-8.** Fontes em ANSI/cp1252 podem ter acentos
   corrompidos em comentários/strings de UI; identificadores PB são ASCII, então
   o grafo não é afetado. Revisitar (detecção de encoding) quando o UIStringIndex
   virar critério de busca — passo 3 do SPEC.
4. **DI manual por construtor no composition root (CLI).** DIP está garantido
   pelas portas; `tsyringe` entra quando houver múltiplos entry points (HTTP) e
   grafo de dependências de construção maior — adotá-lo agora seria cerimônia
   sem ganho.
5. **JsonObjectRepository é descartável por design.** Implementa
   `IObjectRepository`; o adapter Postgres (SPEC §7/§10) o substitui atrás da
   mesma porta sem tocar em use case algum.
6. **`opens` como tipo de aresta próprio** (o SPEC lista `triggers_event`, ainda
   não implementado). Navegação entre janelas é sinal forte para diagnóstico e
   caiu naturalmente da heurística.

## Limitações conhecidas

- Chamadas de função locais (`wf_*`, métodos de objeto) não viram aresta — só
  funções globais (.srf). Métodos/eventos exigem a camada AST (SPEC §13.8).
- `function_call` não distingue chamada real de menção em comentário; o custo de
  um falso positivo aqui é baixo (aresta extra no contexto).
- Um objeto `messagebox` global em `geralaudo` colide com o builtin MessageBox —
  toda janela que usa MessageBox ganha aresta para ele. Inofensivo, mas ilustra
  o limite da heurística.
- `readAll()` carrega os 289 MB em memória de uma vez (~1 GB de heap no pico).
  Aceitável em máquina de dev; trocar por streaming se virar problema.

## Próximos passos (ordem do SPEC §13)

- **3.** UIStringIndex consultável (as strings já são extraídas por objeto;
  falta o índice invertido string→objetos e a busca).
- **4.** Versionamento: snapshots nomeados + diff por `content_hash`.
- **5–6.** Tickets + embeddings + `ticket_object_links`.
- **7.** Motor de diagnóstico — a ponte imediata é usar `--dump` no fluxo do
  teste-minimo para validar que o contexto do grafo fecha a lacuna do caso
  SMART-51352 (zoom da w_confirm_agm).
