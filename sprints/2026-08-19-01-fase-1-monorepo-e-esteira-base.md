# Fase 1 — Monorepo e esteira base

- **Data:** 2026-08-19
- **Solicitação:** montar a esteira de IA para chamados do SMART Desktop, com backend, interface, análise de trace e RAG sobre o codebase num único repositório
- **Status:** concluído
- **Commits:** `65ac7bb` (first commit), `7697598` (junta smart-ai-flow, web, app_trace e pb-insight num único repo) — ~27.000 linhas em 194 arquivos
- **Registro reconstruído retroativamente a partir do histórico git** (ver `2026-08-20-04`)

## O que foi feito
1. **Consolidação em monorepo.** Quatro bases que viviam separadas passaram a
   conviver no mesmo repositório. `web/` e `app_trace/` eram repos git sem
   relação com este e foram trazidos como conteúdo normal, sem preservar o
   histórico local (o `app_trace` segue publicado em `github.com/Dants0/app_trace`).
2. **Backend da esteira (`smart-ai-flow/`)** — Fastify + Prisma:
   - `domain/stages.ts`: máquina de estados com dono por estágio
     (`NOVO`→dev, `ANALISE`→IA, `DESENVOLVIMENTO`→IA, `REVISAO`→dev,
     `RESOLVIDO`→dev, `ERRO`→dev). É a regra central do produto: o orquestrador
     só executa automaticamente estágios cujo dono é a IA.
   - `domain/card.ts`, `orchestrator/orchestrator.ts`, `agents/` (`contracts.ts`
     com Zod, `analyzer.ts`, `proposer.ts`).
   - `infra/`: `anthropic.ts`, `llm.ts`, `jiraService.ts`, `traceService.ts`,
     `pbInsight.ts`, `moduleContext.ts`, `cardRepository.ts`, `db.ts`.
   - Prisma: `Card`, `History`, `Run` — migrações `init`, `add_card_images`,
     `add_trace_fields`, `drop_branch_field`, `cascade_delete_history_runs`.
   - Briefing por módulo do SMART Desktop em `modules/<modulo>/CLAUDE.md`
     (nesta fase, apenas `smartweb`).
3. **Interface (`web/`)** — Next.js: board Kanban (`app/page.tsx`,
   `BoardColumn`, `CardTile`), detalhe do card com diff (`CardDetail`,
   `DiffView`), criação de card (`NewCardModal`) e configurações (`SettingsModal`).
4. **app_trace (`app_trace/`)** — microserviço Go que interpreta logs de trace
   de banco/PowerBuilder: parser (`internal/parser`), camada de IA
   (`internal/ai`) e frontend próprio (`index.html` + `styles.css`).
5. **PB Insight (`pb-insight/`)** — motor de RAG sobre o codebase PowerBuilder,
   em arquitetura hexagonal (`domain/`, `application/ports`, `use-cases/`,
   `infrastructure/`): parsers de objetos PB, extração de eventos, grafo de
   dependências, índice de busca, embeddings, clientes de LLM (Claude e OpenAI)
   e base de chamados resolvidos. Traz junto os 15 documentos de fase próprios
   em `pb-insight/docs/`.

## Decisões
- **"A IA propõe, o dev aplica."** O backend tem acesso somente-leitura ao
  código e nunca toca no controle de versão; a esteira para em `REVISAO` e
  espera o dev — a IA nunca fecha um chamado sozinha.
- **A chave de IA vive só no backend.** Nenhum dev bate na API pela própria
  máquina, o que mantém custo e uso auditáveis (`Run`).
- **Contexto da IA = `CLAUDE.md` do módulo + RAG do PB Insight + o chamado**,
  em vez de só o texto do chamado.
- **Monorepo sem histórico dos repos de origem**: o custo de reescrever o
  histórico de `web/` e `app_trace/` não se pagava — nenhum dos dois tinha
  relação com este repo.

## Pendências desta fase (resolvidas depois)
- Configuração ainda no `.env`, exigindo reiniciar o backend a cada troca → fase 2.
- Sem autenticação, sem fila e sem empacotamento Docker do conjunto → fase 3.
