# 09 — Base de conhecimento de tickets (§13.5 + §13.6)

## O que foi construído

Cadastro manual de tickets resolvidos, com embedding para busca por
similaridade semântica (§13.5), e `ticket_object_links` — o elo que liga um
ticket ao objeto real de causa raiz (§13.6).

Decisão explícita do usuário (SPEC §14, "origem dos tickets históricos"):
**entrada 100% manual, sem scraping nem integração automática** com o
sistema de chamados. O usuário cadastra os próprios tickets já resolvidos
(SMART-51120, 50775, etc.) via CLI ou HTTP.

## Domínio

```
Ticket
  id, externalId (ex: "SMART-51120"), title, descriptionRaw, resolutionText,
  module, versionAffected, resolvedAt, createdAt

TicketObjectLink
  id, ticketId, objectId ("library/name", estável entre reingestões),
  event (owner+name, opcional — granularidade de docs/04),
  confidence ("confirmed" sempre, hoje — "inferred" reservado para quando o
  motor de diagnóstico puder propor links sozinho),
  notes, createdAt
```

## Desvios deliberados do SPEC original (mesmo espírito da troca Postgres → JSON)

- **Armazenamento**: `JsonTicketRepository` (JSON em disco), não Postgres. Na
  escala de cadastro manual (dezenas/poucas centenas de tickets), reescrever
  o arquivo inteiro a cada `addTicket`/`addLink` é barato e simples. Um
  adapter Postgres+pgvector pode substituir a classe atrás da mesma porta
  (`ITicketRepository`) sem tocar nos use cases.
- **Embeddings**: OpenAI `text-embedding-3-small`, não Voyage AI (cogitado no
  SPEC §10). Reaproveita a `OPENAI_API_KEY` já configurada para o
  `OpenAIDiagnosticClient` — evita cadastrar uma terceira chave de API só
  para embeddings. Custo é desprezível (~$0.02/1M tokens), mas real: `POST
  /tickets` e `GET /tickets/similar` chamam a API a cada cadastro/busca.
- **Similaridade**: cosseno calculado em memória sobre todos os embeddings
  carregados (`Array.map` + `sort`), não `pgvector`. Trivial na escala atual;
  reavaliar se a base crescer para milhares de tickets.

## Comandos (CLI)

```sh
npm run ticket -- add --external SMART-51120 --title "..." \
  --description descricao.txt --resolution resolucao.txt \
  [--module X] [--version-affected 26.2.03A] [--resolved-at 2026-01-10]

npm run ticket -- link --ticket SMART-51120 --object w_confirm_agm \
  [--event zoom --owner dw_agm18tab] [--notes "..."]

npm run ticket -- list

npm run ticket -- similar "texto do novo chamado" [--limit 5]
npm run ticket -- similar --text chamado.txt [--limit 5]
```

## Endpoints HTTP

- `POST /tickets` — cadastra (calcula embedding; 409 se `externalId` já existe).
- `GET /tickets` — lista todos.
- `GET /tickets/:id` — detalhe + links (aceita id interno ou externalId).
- `POST /tickets/:id/links` — cria um `ticket_object_link`.
- `GET /tickets/similar?q=...&limit=N` — busca por similaridade semântica.

## Testes

- `tests/infrastructure/json-ticket-repository.test.ts` — persistência,
  reload do disco, ranking de similaridade por cosseno (vetores sintéticos).
- `tests/use-cases/tickets.test.ts` — `AddTicketUseCase` (duplicata
  rejeitada), `LinkTicketToObjectUseCase` (objeto/evento inexistente,
  ambiguidade entre PBLs), `FindSimilarTicketsUseCase` (ranking + links
  anexados).
- `tests/http/server.test.ts` — fluxo completo via HTTP: cadastra, rejeita
  duplicata, lista, linka a um objeto real do fixture (`w_confirm_agm` +
  evento `dw_agm18tab.zoom`), rejeita objeto inexistente, busca por
  similaridade e confere que o resultado top trouxe o link certo.

104 testes passando no total (90 antes deste incremento + 14 novos).

## O que NÃO foi feito nesta etapa (próximos passos)

- **Wiring no motor de diagnóstico (§13.7)**: `DiagnoseTicketUseCase` ainda
  não consulta `FindSimilarTicketsUseCase` para preencher a seção "Tickets
  semelhantes" do formato de saída do SPEC (§9). Isso é o próximo passo
  natural, mas é uma decisão de escopo separada (like formatar confiança
  calibrada por precedente real) — não assumida aqui.
- **Governança de dados (SPEC §14, ainda aberto)**: texto de ticket + código
  saindo para a API da OpenAI (embedding) e Claude/OpenAI (diagnóstico)
  segue sendo uso pessoal. Nada nesta etapa muda essa avaliação — o volume
  de dados saindo aumentou (tickets, além de código), então vale revisitar
  antes de qualquer uso além do pessoal.
- **Ground truth retroativo**: a ferramenta agora permite linkar os tickets
  reais (SMART-51120, 50775, 50782, 48908, 50473, etc.) aos objetos de causa
  raiz, mas isso é trabalho manual do usuário via `npm run ticket -- add` +
  `link` — não foi feito automaticamente aqui (não há como, dado que a
  origem é manual by design).
