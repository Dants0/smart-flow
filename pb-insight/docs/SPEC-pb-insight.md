# PB Insight — Especificação de Arquitetura

> Nome provisório do projeto. Objetivo: unificar mapeamento estrutural de código PowerBuilder legado, versionamento histórico e base de conhecimento de chamados (RAG) num único sistema capaz de diagnosticar causa raiz de bugs de forma *grounded* (ancorada em evidência real, não em suposição do LLM) e detectar regressões entre versões.

---

## 1. Visão

Hoje, quando um chamado chega (ex: `INC/BUG - BLOQUEAR CONVENIO NO DOMINGO`), a triagem automática por IA (N8N) produz diagnóstico textual genérico porque não tem acesso à estrutura real do código. Quem resolve de fato (Tiago, você) usa conhecimento tácito acumulado — "isso é a `d_lmc02tab`, campo `lmc_periodo`" — que não está escrito em lugar nenhum.

O PB Insight existe para transformar esse conhecimento tácito em infraestrutura consultável, com três capacidades centrais que se reforçam mutuamente:

1. **Mapa estrutural do código** — não só "quem chama quem" (grafo de dependências), mas o *conteúdo* de DataWindows (code tables, colunas, SQL de retrieve), telas, funções e sua ligação com o que o usuário final vê na UI.
2. **Linha do tempo de versões** — cada ingestão de código é um snapshot imutável. É possível perguntar "o que mudou no objeto X entre a versão 25.4 e a 26.1.04?" e "quais objetos relacionados a este sintoma mudaram numa janela de versões onde o bug começou a aparecer?".
3. **Memória institucional de chamados** — cada ticket resolvido, com sua causa raiz real (não a suposição inicial), vira caso de referência buscável por similaridade semântica, não só por palavra-chave.

O motor de diagnóstico consome as três camadas juntas para produzir uma resposta como a que o Tiago daria manualmente, com evidência anexada e confiança calibrada — nunca um chute com tom de certeza.

---

## 2. Princípios de design

- **Grounding sobre geração livre.** O LLM nunca responde "do zero" — ele sintetiza a partir de contexto recuperado (grafo, diff de versão, tickets similares). Se o contexto recuperado for fraco, a resposta declara isso explicitamente.
- **Snapshots imutáveis.** Nenhuma ingestão de versão sobrescreve a anterior. O histórico completo é o ativo mais valioso do sistema a longo prazo.
- **Extensibilidade sobre completude imediata.** O parser de PowerScript é uma linguagem real, não trivial de cobrir 100%. A arquitetura precisa permitir adicionar suporte incremental sem redesenho.
- **SOLID como disciplina de fronteira**, não como burocracia:
  - **SRP** — cada parser de tipo de objeto (Window, DataWindow, Function, Menu) é uma classe isolada.
  - **OCP** — suporte a nova versão do PowerBuilder ou novo tipo de objeto entra como novo adapter, sem alterar o orquestrador.
  - **LSP** — qualquer parser é substituível atrás de `IPBObjectParser`.
  - **ISP** — interfaces pequenas e específicas (`IDependencyExtractor`, `IContentIndexer`, `IEmbeddingProvider`).
  - **DIP** — a camada de aplicação depende de portas (interfaces), nunca de Postgres, Claude API ou sistema de arquivos diretamente.

---

## 3. Modelo de domínio

```
CodebaseVersion
  id, label (ex: "26.2.03A"), ingested_at, source_hash, notes

PBObject
  id, version_id, type (Window | DataWindow | Function | Menu | UserObject | Structure),
  name, library, file_path, content_hash

ObjectDependency
  from_object_id, to_object_id, call_type (function_call | inherits | embeds | references | triggers_event)

DataWindowDefinition
  object_id, columns[], code_tables[] (lista de valores estáticos), retrieve_sql, computed_fields[]

UIStringIndex
  object_id, string_value, context (label | header | messagebox | menu_item | column_header)

Ticket
  id, external_id (ex: "SMART-51120"), title, description_raw, module,
  version_affected, resolution_text, resolved_at

TicketObjectLink
  ticket_id, object_id, confidence, source (human_confirmed | inferred_by_diagnostic)

DiagnosticSession
  ticket_input, candidates[], confidence_score, version_regression_detected (bool),
  output_text, created_at, human_feedback (correct | incorrect | partial | null)
```

`TicketObjectLink` é o elo mais importante do sistema: transforma "ticket resolvido" em dado estruturado que alimenta a busca por similaridade (RAG) e valida se o motor de diagnóstico aponta para os objetos certos ao longo do tempo.

---

## 4. Arquitetura em camadas

Clean Architecture / Hexagonal, com fronteiras estritas de dependência (sempre apontando para dentro):

```
┌─────────────────────────────────────────────┐
│ Interfaces (CLI, HTTP/Fastify)               │
├─────────────────────────────────────────────┤
│ Application (use cases, orquestração)        │
├─────────────────────────────────────────────┤
│ Domain (entidades, regras puras, sem I/O)    │
├─────────────────────────────────────────────┤
│ Infrastructure (Postgres, parsers, LLM,      │
│ embeddings, sistema de arquivos, ticketing)  │
└─────────────────────────────────────────────┘
```

Portas principais: `IPBObjectParser`, `IDependencyExtractor`, `IEmbeddingProvider`, `ILLMClient`, `IObjectRepository`, `ITicketRepository`, `IVersionDiffRepository`. Injeção de dependência via `tsyringe` no composition root.

---

## 5. Ingestão: leitura direta dos arquivos-fonte já exportados

Confirmado no repositório real: cada `.pbl` tem uma pasta irmã `<nome>.pbl.src` contendo os objetos já exportados individualmente em texto (`.srf`, `.srd`, etc.). Não é preciso ORCA nem agente Windows separado. A pasta `.pbl.src` é versionada pelo Git junto com o `.pbl` — cada commit na main já é um snapshot completo e datado de todos os objetos.

O agente de ingestão roda em qualquer SO: depois do `git pull` (feito pelo usuário), `pb-insight ingest` varre as pastas `*.pbl.src` do working directory e persiste como novo `CodebaseVersion`.

## 6. Parsing de código PowerBuilder

Estratégia em duas camadas complementares (ambas fazem parte da arquitetura final):

**Camada heurística (regex/tokenização estrutural)** — assinatura de função/evento, chamadas de função, SQL embutido, code tables de DataWindows, strings de UI.

**Camada de AST real (parser formal de PowerScript)** — para fluxo de controle de verdade, usando `chevrotain` ou `peggy`, com gramática incremental expandida conforme necessidade real.

Cada tipo de objeto tem seu parser dedicado implementando `IPBObjectParser`. O `ui-string-indexer` liga strings visuais ("campo Período") ao objeto real (`d_lmc02tab`).

---

## 7. Versionamento e detecção de regressão

Snapshots imutáveis identificados por `content_hash` (SHA-256). Diff entre versões calculado sob demanda e cacheado. Query de regressão: candidatos via UI-string + embedding → expansão do grafo (N hops) → filtro por objetos com `content_hash` diferente entre as versões → ranking por relevância estrutural × mudança na janela do sintoma.

---

## 8. Base de conhecimento (RAG de chamados)

Tickets resolvidos com campos estruturados + embedding vetorial (Voyage AI — API Claude não tem embedding nativo). Vector store: `pgvector` no próprio Postgres. `ticket_object_links` fecha o loop de feedback humano.

---

## 9. Motor de diagnóstico (orquestração)

`DiagnoseTicketUseCase`: extração estruturada do ticket → candidatos (UI-string + embedding) → expansão de grafo → checagem de regressão de versão → tickets similares → síntese via Claude → `calibrateConfidence` como regra de negócio explícita (não instrução de prompt).

Formato de saída:

```
Causa raiz (grounded em código): ...
Correção sugerida: ...
Evidência: [trecho relevante do code table / grafo / diff de versão]
Confiança: Alta | Média | Baixa
Tickets semelhantes: [lista com external_id]
```

---

## 10. Stack técnica

| Camada | Escolha | Motivo |
|---|---|---|
| Linguagem | TypeScript (strict mode) | Consistência com o portfólio |
| DI | tsyringe | Já usado no DONA-APP |
| Banco | PostgreSQL + pgvector | Um único banco para grafo, versionamento e vetores |
| Embeddings | Voyage AI | Recomendado pela Anthropic |
| LLM | Claude via API (Sonnet síntese, Haiku extração) | Ecossistema atual |
| Parser AST | chevrotain ou peggy | Gramática incremental de PowerScript |
| API | Fastify | Consistente com outros backends |
| Testes | Vitest | Domínio testável isoladamente |
| Infra | Docker Compose (`api`, `worker`, `postgres`) | Padrão dos outros projetos |

---

## 11. Estrutura de pastas

```
pb-insight/
  src/
    domain/{entities,value-objects}/
    application/{use-cases,ports}/
    infrastructure/{parsers,persistence,llm,embeddings,ticketing}/
    interfaces/{cli,http}/
  docker-compose.yml
  vitest.config.ts
```

---

## 12. Fluxo completo de exemplo (ticket real)

`INC/BUG - BLOQUEAR CONVENIO NO DOMINGO`: ingestão do ticket → UIStringIndex encontra `"Período"` → `d_lmc02tab` candidata → expansão de grafo → code table de `lmc_periodo` expõe valores 2–7, Domingo (1) ausente → tickets similares SMART-44584/44495 → síntese → feedback grava `ticket_object_links`.

---

## 13. Ordem de construção da arquitetura completa

1. Domínio + portas (interfaces).
2. Parsers heurísticos + ingestão de uma versão → grafo de dependências navegável.
3. Índice de UI-strings + extração de conteúdo de DataWindow (code tables, SQL).
4. Versionamento (snapshots + diff sob demanda).
5. Ingestão de tickets históricos + embeddings + busca por similaridade.
6. `ticket_object_links` com dados retroativos.
7. Motor de diagnóstico orquestrando as camadas 2–6.
8. Camada de AST formal (sob demanda).
9. Interface HTTP para o time, além do CLI pessoal.

---

## 14. Pontos em aberto para decidir antes de codar

- **Origem dos tickets históricos**: API/export do sistema de chamados ou ingestão manual/scraping?
- **Governança de dados**: código e texto de ticket saindo para a API da Anthropic — precisa de aval formal de segurança/compliance da Pixeon antes de virar ferramenta de time?
- **Ground truth inicial**: linkar manualmente os tickets já resolvidos (SMART-51120, 50775, 50782, 48908, 50473, etc.) aos objetos reais de causa raiz.

---

## Regras operacionais (adicionadas na aprovação do projeto)

- Foco inicial total no backend + testes unitários.
- **NUNCA rodar comandos git dentro de `C:\controle de versão`** — a ingestão lê arquivos via filesystem, apenas.
- Documentar em `docs/` tudo o que for construído.
