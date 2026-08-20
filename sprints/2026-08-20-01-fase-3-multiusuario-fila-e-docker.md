# Fase 3 — Multiusuário, fila de jobs e stack em Docker

- **Data:** 2026-08-20
- **Solicitação:** transformar o protótipo em plataforma de time — login, credenciais por usuário, processamento fora do request, monitoramento e instalação por Docker
- **Status:** concluído
- **Commit:** `323105a` ("feat: fase 3") — 79 arquivos, +5.939/−663
- **Registro reconstruído retroativamente a partir do histórico git** (ver `2026-08-20-04`)

## O que foi feito

### Autenticação e usuários
1. **Modelo `User`** com `passwordHash` (scrypt, formato `salt:hash`), `isAdmin`
   e `mustChangePassword` — conta criada por admin nasce com senha provisória e
   a plataforma cobra a troca no primeiro acesso.
2. **Credenciais do Jira por usuário** (`jiraUser`, `jiraPasswordEnc`): sem
   isso, `assignee = currentUser()` resolveria para uma conta única e todo mundo
   veria os chamados da mesma pessoa.
3. **`infra/crypto.ts`** com dois usos e garantias distintas: hash one-way
   (scrypt) para a senha da plataforma, cifra reversível (AES-256-GCM, chave
   mestra em `ENCRYPTION_KEY`) para a senha do Jira, que o Basic Auth exige em
   claro na hora da chamada.
4. **`infra/userRepository.ts`**, JWT no Fastify (`types/fastify-jwt.d.ts`),
   e no front: `app/login/page.tsx`, `components/AuthGuard.tsx`, `lib/auth.ts`,
   `app/settings/account/page.tsx` e `app/settings/users/page.tsx` (admin).
5. **`DismissedIssue`**: o aviso de "chamado atribuído a você" dispensado virou
   registro por usuário no banco — antes era um `Set` em memória, global e
   perdido a cada restart.
6. **Autoria no histórico**: `History.userId` — antes o histórico só dizia "um
   dev rejeitou o diff", rastreabilidade inútil num time.

### Fila de processamento
7. **`infra/jobQueue.ts` + modelo `Job`**: `POST /cards` enfileira e responde na
   hora; um worker in-process consome. Resolve o **card zumbi** — job `RUNNING`
   órfão (processo morreu no meio) volta para `PENDING` no startup em vez de o
   card ficar preso para sempre; job que estoura as 3 tentativas manda o card
   para `ERRO`, de onde o dev reprocessa pela UI.

### Custo, qualidade e monitoramento
8. **`infra/costs.ts`**: tabela de preço por 1M de tokens por modelo, com
   fallback tolerante a sufixo de versão — modelo desconhecido registra custo 0
   e nunca quebra o run. **`infra/runRepository.ts`** agrega o consumo.
9. **`Card.grounded`**: marca a análise que rodou sem contexto de código
   (pb-insight fora do ar) — sem isso, uma análise sem grounding parece tão
   confiante quanto uma com.
10. **`Card.resolutionText`**: o que o dev *realmente* aplicou, que pode divergir
    do diff proposto. É esse texto que alimenta a base de conhecimento do
    pb-insight no `RESOLVIDO` — senão a base aprende a solução errada e piora
    com o tempo.
11. **`infra/monitor.ts`**: health check de Postgres, app_trace, PB Insight,
    Jira e chaves de IA, alimentando a aba **Monitor de Recursos**
    (`app/settings/resources/page.tsx`, `components/settings/ResourceCard.tsx`).

### Empacotamento e instalação
12. **Stack completa em Docker**: `docker-compose.yml` na raiz, `Dockerfile` +
    `.dockerignore` para backend, web e pb-insight, `docker-entrypoint.sh` do
    pb-insight, `.env.example` da raiz e os scripts `setup.ps1` / `setup.sh`,
    que geram `JWT_SECRET` e `ENCRYPTION_KEY` únicos por instalação sem
    sobrescrever um `.env` existente.
13. **PB Insight preparado para container**: caminho dos fontes via
    `PB_INSIGHT_WS_ROOT` (o fallback Windows continua valendo), e cliente de
    embeddings criado sob demanda — antes o SDK exigia a chave já no construtor
    e derrubava o servidor inteiro na subida sem `OPENAI_API_KEY`, mesmo o
    embedding servindo só à busca por tickets semelhantes.

### Front e conteúdo
14. `BoardFilters`, `SetupBanner`, `ThemeToggle` + `lib/theme.ts` (tema claro/
    escuro), `CardTile`/`CardDetail` revisados e `lib/api.ts` reescrito para o
    fluxo autenticado.
15. Briefings dos módulos restantes: `modules/agenda`, `atende`, `cadgf`,
    `mwsus` (`CLAUDE.md` cada).
16. **Testes**: `tests/card.test.ts`, `stages.test.ts`, `costs.test.ts`,
    `crypto.test.ts`.
17. **README reescrito** (+191 linhas): instalação por Docker, indexação do
    PB Insight, uso no dia a dia, operação e arquitetura.

## Migrações
- `20260820030000_auth_jobs_costs_grounding`
- `20260820040000_user_setup_and_history_author`

## Decisões
- **Fila in-process, não Redis/BullMQ.** Mais infra para manter num cenário de
  um punhado de cards por dia; a migração, se um dia precisar, fica local a
  `jobQueue.ts`.
- **Senha do Jira cifrada, não hasheada** — o Basic Auth precisa dela em claro.
  A chave mestra vive no `.env` porque não dá para guardá-la no próprio banco
  que ela protege.
- **Custo estimado, não faturado**: a fonte da verdade de cobrança segue sendo
  a fatura do provedor; a tabela local serve para acompanhar consumo.

## Pendências desta fase (resolvidas depois)
- Dentro do Docker, os microserviços seguiam configurados como `localhost` e
  apareciam OFFLINE no monitor → fase 4.
