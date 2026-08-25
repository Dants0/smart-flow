# 05 — Busca em código + API HTTP (Fastify)

> Entregue em 2026-07-24. Duas peças: (1) busca por palavra-chave estendida
> para corpos de evento, não só texto de UI; (2) interface HTTP (SPEC §13.9,
> Fastify conforme SPEC §10), expondo os use cases já existentes como
> endpoints REST com documentação interativa. Ambas validadas contra o grafo
> real (15.928 objetos).

## 1. Busca em código (não só UI-strings)

Pedido direto do usuário: *"digitar uma palavra-chave e o backend retornando
onde está a datawindow, window e todo o caminho e lugares que chama"*. Antes,
`search` só olhava `structured.uiStrings` (texto visível na tela). Agora
também varre `structured.events[].body` — o corpo de cada evento/função
extraído (docs/04) — e retorna **objeto + controle dono + evento + linhas**,
não só o objeto.

Renomeação limpa (sem shim de compatibilidade, por instrução do projeto):
`IUIStringIndex`/`UIStringMatch` → `ISearchIndex`/`SearchMatch` (com `kind:
"ui_string" | "event"`); `InMemoryUIStringIndex` → `InMemorySearchIndex`;
`SearchUIStringsUseCase` → `SearchUseCase`.

```sh
npm run search -- "ScrollToRow" --limit 5
```

Validado contra o repo real — retorna, por exemplo:
```
[código] dw_entrada.ue_scrolltorow (linhas 638-639)  lab50/lab50/u_multiplo
         "This.ScrollToRow ( p_row )"
```

Resultados de `ui_string` vêm primeiro (tendem a ser mais precisos — texto
que o usuário realmente vê), depois `event`, ordenados por tamanho do match.

## 2. API HTTP (Fastify)

```
src/interfaces/http/
  app-context.ts        composition root: carrega o grafo + índice de busca uma vez
  build-server.ts        fábrica do app Fastify (testável via .inject(), sem porta real)
  start.ts                entrypoint (`npm run serve`) — carrega .env, sobe o servidor
  dto.ts                  ObjectSummaryDTO — versão enxuta de PBObject para respostas de lista
  routes/
    health.route.ts
    search.route.ts
    objects.route.ts      /objects/:name, /objects/:name/context, /objects/:name/events/:eventName, /objects/:name/events/:eventName/siblings
    snapshots.route.ts     /snapshots, /diff
    diagnose.route.ts      /diagnose (POST)
```

`npm run serve` (variáveis opcionais: `PORT`, `HOST`, `PB_INSIGHT_GRAPH`,
`PB_INSIGHT_WS_ROOT`). Documentação interativa (Swagger UI) em `/docs`; JSON
OpenAPI em `/docs/json`. CORS aberto (`origin: true`) — uso local/pessoal
pensando no frontend futuro; reavaliar se este servidor for exposto além de
localhost.

### Endpoints

| Método | Rota | O que faz |
|---|---|---|
| GET | `/health` | Status + versão do grafo carregado em memória |
| GET | `/search?q=&limit=` | Busca por palavra-chave (UI + código) |
| GET | `/objects/:name` | Objeto completo (controles, dataobjects, eventos, colunas) |
| GET | `/objects/:name/context?hops=` | Ancestrais + relacionados (N saltos) + dependentes reversos |
| GET | `/objects/:name/events/:eventName?owner=` | Corpo de um evento/função específico |
| GET | `/objects/:name/events/:eventName/siblings?owner=&limit=` | Outras ocorrências do mesmo evento no mesmo tipo de controle (abrangência, docs/16) |
| GET | `/snapshots` | Lista snapshots históricos disponíveis |
| GET | `/diff?from=&to=&only=&contains=` | Diferenças entre dois snapshots (ou snapshot × grafo atual) |
| POST | `/diagnose` | Motor de diagnóstico — **chama a API da Anthropic, custo real**, salvo `dryRun: true` |

`GET /objects/:name`, `/context` e `/events/:eventName` retornam 404 quando o
objeto/evento não existe. `/diff` retorna 400 para nome de snapshot inválido
(inclui defesa contra path traversal — só aceita nome de arquivo, sem `/`,
`\` ou `..`, dentro de `.data/snapshots/`).

### `POST /diagnose` — corpo da requisição

```json
{
  "objectName": "w_confirm_agm",
  "ticketText": "texto do chamado...",
  "hops": 1,
  "relations": ["embeds", "references"],
  "event": { "owner": "dw_agm18tab", "name": "zoom" },
  "dryRun": false
}
```

- `relations` aceita array de tipos, `"all"` ou `"none"`. Default:
  `["embeds","references"]` (ver docs/03 — exclui `opens`/`function_call` por
  inflarem o contexto sem sinal).
- `event` troca o dump do objeto raiz inteiro por só o evento isolado (ver
  docs/04 — é o que converge para o mecanismo correto do fix a 10x menos custo).
- `dryRun: true` monta e reporta o contexto (tamanho, objetos incluídos) sem
  chamar o LLM — use para orçar antes de gastar.

### Validação real

Servidor subido contra o grafo completo (15.928 objetos, `/health` confirma).
Testado manualmente: `/search` (código e UI), `/objects/:name/context`
(retorna corretamente os 4 embeds + 14 references + 25 opens + ~40
function_call de `w_confirm_agm`), `/objects/:name/events/:eventName`, 404 em
objeto inexistente, `/diagnose` com `dryRun: true` (sem custo), `/docs` e
`/docs/json` (Swagger). 15 testes de integração via `.inject()` cobrem os
mesmos casos com fixtures determinísticas (sem rede).

## Decisões registradas

1. **Rename limpo de UIString→Search, sem shim.** Consistente com a
   instrução do projeto de não manter compatibilidade retroativa artificial
   — o código antigo foi apagado, não deprecado.
2. **`/diagnose` não força `dryRun` por padrão** — mesma paridade do CLI
   (`diagnose.command.ts` já chama o LLM por padrão salvo `--dry-run`). Custo
   real é responsabilidade explícita de quem chama, documentada em destaque
   no Swagger (`summary`/`description` da rota).
3. **Reingestão continua sendo só CLI (`npm run ingest`), não um endpoint
   HTTP.** Parsear ~289MB/16k arquivos é síncrono e demora ~40-50s — rodar
   isso dentro de uma request de um servidor Node single-thread bloquearia o
   event loop para todas as outras requisições simultâneas. O servidor só
   lê `.data/graph.json` (rápido); reingestão continua sendo "rodar `npm run
   ingest` depois do `git pull`", como o SPEC §5 já desenhava.
4. **`/diff` e `/snapshots` operam sobre arquivo, com allowlist de nome.**
   Aceita só nome de arquivo (basename) dentro de `.data/snapshots/` — nunca
   caminho arbitrário — mesmo sendo uso local, é a diferença entre "ferramenta
   pessoal" e "ferramenta pessoal que também lê qualquer arquivo do disco se
   alguém mandar a query certa".
5. **`ObjectSummaryDTO` para respostas de lista, objeto completo só em
   `/objects/:name`.** `context` a hops=1 de `w_confirm_agm` já tem 80
   relacionados — incluir `structured` completo (eventos, colunas) em cada um
   infla a resposta sem necessidade; quem precisa do detalhe pede o objeto
   específico.

## Limitações conhecidas

- Sem autenticação/autorização — API pensada para uso local (`127.0.0.1`) ou
  atrás de algo que já autentique. Adicionar antes de expor além disso.
- `/diagnose` não tem rate limiting nem log de custo acumulado — para uso
  pessoal não é crítico agora, mas vira necessário se um frontend/vários
  usuários passarem a chamar com frequência.
- Sem testes de carga — 74 testes (59 unitários + 15 HTTP) cobrem
  corretude funcional, não throughput/concorrência.

## Próximos passos

- Frontend consumindo esta API (a motivação declarada do usuário para
  construí-la agora).
- Rodar 2-3 chamados reais diferentes via `/diagnose` (ainda pendente desde
  o docs/03) antes de qualquer conclusão mais ampla sobre a hipótese de
  granularidade de evento.
- Autenticação básica se o servidor sair de `127.0.0.1`.
