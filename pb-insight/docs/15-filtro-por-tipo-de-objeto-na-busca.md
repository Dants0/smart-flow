# 15 — Filtro por tipo de objeto na busca

> Pedido em 2026-07-24: na aba Buscar, poder filtrar por Window, DataWindow,
> Function, UserObject etc.

## O que mudou

- `PB_OBJECT_TYPES` — lista canônica dos 11 `PBObjectType` exportada de
  `domain/value-objects/pb-object-type.ts` (mesma ordem de
  `EXTENSION_TO_TYPE`, ver docs/08), reaproveitada para validação e para a
  UI em vez de duplicar a lista solta em cada camada.
- `ISearchIndex.search(query, limit?, types?)` — novo parâmetro opcional.
  `InMemorySearchIndex` filtra por `object.type` **antes** de aplicar
  `limit`, não depois — filtrar depois do corte perderia matches do tipo
  pedido quando eles não estivessem entre os primeiros N por ordenação
  (ui_string antes de código, depois por tamanho do texto casado).
- `GET /search?types=Window,DataWindow` (CSV) — 400 com mensagem descritiva
  se algum tipo não estiver em `PB_OBJECT_TYPES`.
- `npm run search -- "texto" --types Window,DataWindow` — mesma validação na
  CLI.
- Frontend: chips de tipo (mesmo componente visual usado em "Objetos ligados
  a este ticket", docs/14) abaixo da barra de busca — clique alterna
  seleção; filtro só é aplicado ao rodar a busca (não busca automaticamente
  ao clicar num chip), mesmo padrão do seletor "Contexto (relations)" na aba
  Diagnosticar.

## Por que CSV numa querystring, não array

Fastify aceita array em querystring (`?types=Window&types=DataWindow`), mas
CSV (`?types=Window,DataWindow`) é mais simples de montar a partir de um
`string[]` no frontend (`join(",")`) e mais fácil de digitar manualmente
testando a API via `curl`/Swagger — mesma escolha já usada para `relations`
no `POST /diagnose` (ali é body, aqui é querystring, mas o formato CSV é o
mesmo espírito).

## Verificado

Contra o grafo real: `types=DataWindow` em "período" retorna só
`DataWindow` (30 ocorrências, todas `d_*`); `types=Window` retorna só
`Window` (`w_definir_periodo`, `w_periodo_gen`, etc.) — confirmado na API
(`curl`) e na UI de verdade no Chrome, não só nos testes automatizados (ver
docs/14 sobre por que isso importa: bugs de infraestrutura real só
aparecem testando o app rodando).
