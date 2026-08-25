# Documentação do PB Insight

- [`SPEC-pb-insight.md`](./SPEC-pb-insight.md) — especificação de arquitetura completa (visão, princípios, modelo de domínio, ordem de construção).
- [`01-fundacao-dominio-parsers-grafo.md`](./01-fundacao-dominio-parsers-grafo.md) — domínio, parsers heurísticos, grafo de dependências, CLI de ingestão/contexto.
- [`02-ui-string-index-e-versionamento.md`](./02-ui-string-index-e-versionamento.md) — índice de UI-strings consultável, diff de snapshots entre versões.
- [`03-motor-de-diagnostico-e-validacao-grounding.md`](./03-motor-de-diagnostico-e-validacao-grounding.md) — motor de diagnóstico + validação real que **não confirmou** a hipótese "mais contexto de grafo fecha a lacuna" (achado: o gargalo é granularidade de evento, não objetos ausentes).
- [`04-extracao-de-eventos-e-validacao-positiva.md`](./04-extracao-de-eventos-e-validacao-positiva.md) — extração de eventos individuais + navegação (`npm run event`); re-teste do mesmo ticket com evento isolado **converge para o mecanismo real do fix**, a 10x menos custo.
- [`05-api-http.md`](./05-api-http.md) — busca estendida a corpos de evento (não só UI) + API HTTP Fastify (`npm run serve`), com Swagger em `/docs`.
- [`06-multi-provider-llm-e-controle-de-custo.md`](./06-multi-provider-llm-e-controle-de-custo.md) — modelo default trocado de opus (caro) para sonnet-5; integração com GPT (OpenAI) adicionada; provedor/modelo sempre visível antes de gastar.
- [`07-ingest-assincrono-e-reload-sem-restart.md`](./07-ingest-assincrono-e-reload-sem-restart.md) — `POST /ingest` (assíncrono, processo separado) + `POST /reload`; o servidor se atualiza sozinho após um `git pull`, sem reiniciar. Validado de ponta a ponta contra o repo real (achou e corrigiu um bug real de citação de argumento com espaço no Windows).
- [`08-garantia-de-cobertura-do-ws_objects.md`](./08-garantia-de-cobertura-do-ws_objects.md) — auditoria de cobertura de extensões do `ws_objects`; achou e corrigiu `.srx` (Proxy Object) não reconhecido.
- [`09-base-de-conhecimento-de-tickets.md`](./09-base-de-conhecimento-de-tickets.md) — cadastro manual de tickets resolvidos + embedding (OpenAI, não Voyage AI) + `ticket_object_links`; CLI (`npm run ticket`) e HTTP (`/tickets`).
- [`10-evidencia-visual-e-frontend-de-tickets.md`](./10-evidencia-visual-e-frontend-de-tickets.md) — `POST /diagnose` aceita screenshots como evidência visual (Claude + GPT-4o-mini, visão nativa); nova aba "Tickets" no frontend (cadastro, links, busca por similaridade).
- [`11-diagnosticos-salvos-e-loop-de-feedback.md`](./11-diagnosticos-salvos-e-loop-de-feedback.md) — salvar/apagar diagnóstico + "dar como solucionado" (gera Ticket + link automaticamente); correção do bug de Markdown cru; polimento visual (background, sombras, transições).
- [`12-dependentes-agregados-entre-pbls-colidentes.md`](./12-dependentes-agregados-entre-pbls-colidentes.md) — relato do usuário: contexto de objeto só trazia dependentes do 1º PBL quando o nome colide entre bibliotecas (ex.: `d_lmc02tab` em `agenda50` e `atende50/repac50`); corrigido para agregar de todos os matches.
- [`13-comentario-tech-lead-no-diagnostico.md`](./13-comentario-tech-lead-no-diagnostico.md) — campo opcional "Comentário Tech Lead" na aba de Diagnóstico (+ CLI/API); vira seção própria no prompt como pista a verificar, não fato dado; persistido no diagnóstico salvo.
- [`14-fix-notas-evento-e-apagar-ticket.md`](./14-fix-notas-evento-e-apagar-ticket.md) — notas de link só apareciam em tooltip (corrigido p/ texto visível); evento exigia 2 campos sem validação (agora avisa); `DELETE /tickets/:id` implementado — e achou 2 bugs de infra que quebravam TODO `DELETE` da API no browser real (CORS default + Content-Type em corpo vazio), invisíveis para `.inject()`.
- [`15-filtro-por-tipo-de-objeto-na-busca.md`](./15-filtro-por-tipo-de-objeto-na-busca.md) — filtro por PBObjectType (Window/DataWindow/Function/...) em `GET /search` (+ CLI/UI); filtra antes do `limit`, não depois.
- [`16-abrangencia-do-diagnostico.md`](./16-abrangencia-do-diagnostico.md) — diagnóstico ancorado num objeto só via 1 janela quando 6 tinham o mesmo defeito (SMART-50927); `FindPatternSiblingsUseCase` anexa ao contexto as outras ocorrências do mesmo evento no mesmo tipo de controle, e o prompt ganha seção `Abrangência`.

Cada entrada numerada documenta um incremento de desenvolvimento: o que foi
entregue, validado com dados reais do repositório, decisões tomadas e por quê,
limitações conhecidas, e os próximos passos segundo a ordem de construção do
SPEC (§13). Resultados negativos/nuançados são documentados com o mesmo peso
que sucessos — é o mesmo princípio de calibração de confiança que o SPEC pede
do próprio motor de diagnóstico.

## Estado atual (2026-07-24)

| Peça | Status |
|---|---|
| Domínio + portas (§13.1) | ✅ |
| Parsers heurísticos + grafo de dependências (§13.2) | ✅ — 15.928 objetos, 45.977 arestas no repo real |
| Índice de busca — UI-strings + código (§13.3) | ✅ |
| Conteúdo de DataWindow (colunas, code tables, SQL) (§13.3) | ✅ extraído |
| Extração de eventos/funções individuais (navegação granular) | ✅ — 79 eventos extraídos de um único `.srw` real, 17 donos distintos |
| Versionamento: snapshots + diff (§13.4) | ✅ |
| Ingestão de tickets + embeddings (§13.5) | ✅ — cadastro manual (sem scraping, decisão do usuário); embedding via OpenAI (não Voyage AI) |
| `ticket_object_links` (§13.6) | ✅ — elo ticket↔objeto (+ evento opcional), sempre `confidence: "confirmed"` |
| Motor de diagnóstico orquestrado (§13.7) | ✅ mínimo (sem RAG de tickets ainda) — validado 2x no mesmo ticket real: grafo completo errou a causa (doc 03), evento isolado acertou o mecanismo do fix a 10x menos custo (doc 04). Wiring de "tickets semelhantes" no output do diagnóstico é o próximo passo (ver docs/09) |
| Camada de AST formal (§13.8) | ⬜ — heurística de linha resolveu bem até agora; revisitar se algo real exigir |
| Interface HTTP (§13.9) | ✅ — Fastify, 21 endpoints, Swagger em `/docs`, validado contra o grafo real (incl. ingest assíncrono + reload) |
| Evidência visual (screenshot) no diagnóstico | ✅ — Claude e GPT-4o-mini via visão nativa; CLI, HTTP e frontend |
| Frontend da base de tickets | ✅ — cadastro, `ticket_object_links` e busca por similaridade direto na UI |
| Diagnósticos salvos + "dar como solucionado" | ✅ — fecha o loop de feedback humano: confirma um diagnóstico gerando Ticket + link real |

## Comandos disponíveis

```sh
npm run ingest -- [raiz] [--label X] [--out .data/graph.json]   # varre ws_objects, monta o grafo
npm run context -- <objeto> [--hops N] [--dump arquivo.txt]     # ancestrais + relacionados de um objeto
npm run search -- "palavra-chave" [--limit N]                   # busca em UI e em código (eventos/funções)
npm run event -- <objeto> <evento> [--owner <controle>]         # navega direto a um evento/função específico
npm run diff -- --list | --from <a> [--to <b>] [--only X]       # o que mudou entre dois snapshots
npm run diagnose -- <objeto> --ticket <arq> [--event X --owner Y] [--relations a,b|none|all] [--dry-run] [--images a.png,b.jpg]
npm run ticket -- add --external X --title T --description d.txt --resolution r.txt   # cadastra ticket resolvido
npm run ticket -- link --ticket X --object w_x [--event E --owner O]        # ticket_object_link
npm run ticket -- list | similar "texto" [--limit N]                       # lista / busca por similaridade
npm run serve                                                   # API HTTP (Fastify) — docs em /docs
                                                                 # (POST /ingest + GET /ingest/status + POST /reload
                                                                 #  abstraem `npm run ingest` para o frontend)
npm test                                                        # suite de testes unitários (vitest)
```
