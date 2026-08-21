# SMART AI Flow — backend

Esteira de IA (estilo Kanban) para resolução assistida de chamados do **SMART
Desktop** (PowerBuilder/PFC) e do **SMART Web**. Tira o fluxo do "chat no
terminal" e o transforma em algo visual, centralizado e auditável — com o **dev
sempre no controle**.

Este arquivo é o briefing de quem for mexer neste backend. O briefing do
**código do cliente** (o que a IA analisa) vive em `modules/<sistema>/CLAUDE.md`.

## O fluxo

```
NOVO      ANALISE      DESENVOLVIMENTO   REVISAO     VERSIONAMENTO   RESOLVIDO
(dev   -> (IA: causa-> (IA: diff      -> (dev     -> (commit, push -> (dev
 cola)     raiz)        proposto)         aplica)     e PR)            confirma)
 DEV       IA           IA                DEV         DEV              DEV
```

Só ANALISE e DESENVOLVIMENTO rodam sozinhos. `ERRO` é o estágio de exceção.
A esteira **para em REVISAO** e nunca fecha um chamado sozinha.

Duas paradas antecipadas, ambas deliberadas:

- **`needsTrace`**: se a análise pede pbtrace e não há trace anexado, o card vai
  direto pra REVISAO **sem propor diff**. Propor sem evidência produziu, no
  SMART-50927, um diff inteiro contra arquivos inexistentes.
- **Caminho inventado**: o diff proposto é conferido contra o índice de arquivos
  do repositório; o que não existe vira `Card.unknownPaths` e um aviso vermelho
  na tela, antes do diff.

## Arquitetura (decisão: "IA propõe, dev decide")

- O pipeline **lê** código e nunca escreve. A escrita existe num único ponto: o
  dev clicar em "aplicar o diff" em REVISAO (`infra/workspace.ts`), com
  `patch --dry-run`, backup e reversão de um clique.
- **O backend nunca decide sozinho no controle de versão.** Commit, push e PR só
  acontecem por clique explícito, em VERSIONAMENTO, com a credencial do dev.
- **A chave de IA vive só no backend** (`infra/llm.ts`, vinda de Configurações →
  IA). Todo consumo vira linha em `Run`.
- Contexto da IA = `CLAUDE.md` do sistema + caminhos reais do repositório + RAG
  do PB Insight + skill do time (Configurações → IA) + o chamado.

## Estrutura

```
src/
  domain/        stages.ts (máquina de estados) · card.ts · skill.ts
                 jiraComment.ts (template de entrega do time)
  agents/        contracts.ts (Zod + parser tolerante) · analyzer.ts
                 proposer.ts · jsonCall.ts (retentativa dirigida)
  orchestrator/  orchestrator.ts (roda os estágios de IA, audita em Run)
  infra/         llm.ts · pbInsight.ts · traceService.ts · jiraService.ts
                 repos.ts (os dois repositórios) · workspace.ts (aplica diff)
                 git.ts · bitbucket.ts · objectIndex.ts (arquivos que existem)
                 monitor.ts · jobQueue.ts · crypto.ts · costs.ts
                 *Repository.ts (Prisma)
  http/          routes.ts (Fastify) · schemas.ts (Zod)
modules/         briefing por sistema/módulo do cliente
  smartdesktop/  atende/ agenda/ mwsus/ cadgf/ pacdel/ cirurg/  smartweb/
prisma/          User · Card · History · Run · Job · PlatformSettings
tests/           vitest (86 testes)
```

## Os dois repositórios do cliente

`infra/repos.ts` é a fonte da verdade. O card escolhe o **sistema**, e o sistema
escolhe o repositório:

| | SMART Desktop | SMART Web |
|---|---|---|
| env | `SMART_DESKTOP_PATH` | `SMART_WEB_PATH` |
| raiz dos fontes | `ws_objects/<lib>/<lib>.pbl.src/` | `fontespb11/<modulo>/` |
| companheiro | — | cada `.sru` tem um `.sru.prp` |
| origin | `bitbucket.org/pixeon/smart_desktop` | `bitbucket.org/pixeon/smart_web` |

**Regra de commit, inegociável:**

- Sobem apenas **fontes exportados** (`.sr?` — sra, srd, srf, srm, srq, srs,
  sru, srw) e, no SMART Web, o `.prp` que acompanha cada um.
- **Nunca** `.pbl`, `.pbw`, `.pbd`: são artefatos de build. O working copy vive
  com dezenas deles sujos por efeito de compilar, e o próprio repositório do
  cliente os rastreia por Git LFS com hook de pre-commit.
- **Stage seletivo**: só os arquivos que a correção alterou. Nunca `git add -A`.
- Branch: `bug/SMART-XXXXX` (existe também `feature/SMART-XXXXX`). A plataforma
  **verifica e recusa**; não troca de branch, porque a árvore tem trabalho do dev.
- Mensagem: `:bug:fix SMART-XXXXX <descrição direta>`.

## Convenções deste backend

- **Comentário explica o porquê, não o quê.** Quase todo comentário no código
  aponta pra uma decisão ou pra um bug real que motivou a linha.
- **Erro que o dev lê** — mensagem diz o que fazer, não só o que falhou.
- **Nada de segredo em texto**: senha do Jira e app password do Bitbucket vão
  cifradas (`infra/crypto.ts`); credencial em URL de git passa por
  `redactUrlCredentials` antes de virar log, histórico ou tela.
- **Falhar fechado**: negação de autenticação do Jira arma um disjuntor por
  usuário — insistir rearmaria o CAPTCHA na conta dele.
- **Auditoria não derruba o pipeline**: `recordRun` engole a própria falha.

## Rodar

Tudo via Docker (ver README da raiz):

```bash
docker compose up -d --build backend web   # aplica migrações no start
docker compose logs -f backend
```

Sem Docker:

```bash
npm install
npm run dev        # tsx watch, porta 3333
npm test           # vitest
npm run typecheck
```

Precisa de `DATABASE_URL`, `JWT_SECRET` e `ENCRYPTION_KEY` no `.env`. O resto da
configuração vive no banco, editável pela tela, valendo na hora.

## Ao mexer aqui

1. **Teste o que decide.** Regra de negócio (classificação de arquivo, transição
   de estágio, template do Jira, parser de resposta do modelo) tem teste. Foi um
   teste que pegou a transição `ANALISE → REVISAO` faltando.
2. **Migração é obrigatória** com mudança de schema — o container roda
   `prisma migrate deploy` no start, então `db:push` só serve pra dev local.
3. **Reconstrua os containers** depois de mexer: o `web` roda build de produção
   assado na imagem e o `backend` só aplica migração ao subir.
4. **Documente a solicitação em `sprints/`** ao final (ver `sprints/README.md`).
