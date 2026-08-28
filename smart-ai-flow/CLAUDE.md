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
- **A credencial de IA vive só no backend** (`infra/llm.ts`, vinda de
  Configurações → IA). A da Anthropic é chave de API **ou** token OAuth
  (`CLAUDE_CODE_OAUTH_TOKEN`, o que a conta corporativa emite) — headers
  diferentes, o tipo é escolhido na tela. Todo consumo vira linha em `Run`.
- Contexto da IA = `CLAUDE.md` do sistema + **código real do repositório, nos
  dois estágios** + inventário de reuso (`git grep`) + RAG do PB Insight + skill
  do time (Configurações → IA) + o chamado.

**A análise lê o repositório, não só o RAG.** Até a sprint de 2026-08-25 o
analyzer via apenas os trechos do PB Insight, e isso era uma venda: busca
semântica traz o parecido e erra o idêntico. Quem monta a cadeia de chamada é a
ANÁLISE — sem fonte na frente ela só consegue teorizar sobre propriedade de
controle. Os dois estágios têm orçamentos opostos, de propósito
(`sourceExcerpts.ts`): a análise lê **mais arquivos com menos de cada um**
(largura, pra cadeia atravessar objetos), a proposta lê **menos arquivos
inteiros** (profundidade, pro diff bater no bloco certo).

## Estrutura

```
src/
  domain/        stages.ts (máquina de estados) · card.ts · skill.ts
                 bitbucketIdentity.ts (e-mail autentica a API, usuário o push)
                 traceSection.ts (bloco do app_trace nos dois agentes)
                 jiraComment.ts (template de entrega do time)
                 attachmentText.ts (trace em UTF-16, NUL que o Postgres recusa)
                 jqlStatuses.ts (o que a JQL esconde, pra legenda da tela)
  agents/        contracts.ts (Zod + parser tolerante) · analyzer.ts
                 proposer.ts · jsonCall.ts (retentativa dirigida)
  orchestrator/  orchestrator.ts (roda os estágios de IA, audita em Run)
  infra/         llm.ts · pbInsight.ts · traceService.ts · jiraService.ts
                 repos.ts (os dois repositórios) · workspace.ts (aplica diff)
                 git.ts · bitbucket.ts · objectIndex.ts (arquivos que existem)
                 monitor.ts · jobQueue.ts · crypto.ts · costs.ts
                 *Repository.ts (Prisma)
  http/          routes.ts (Fastify) · schemas.ts (Zod)
                 jsonBodyParser.ts (corpo vazio com content-type json)
modules/         briefing por sistema/módulo do cliente
  smartdesktop/  atende/ agenda/ mwsus/ cadgf/ pacdel/ cirurg/  smartweb/
prisma/          User · Card · History · Run · Job · PlatformSettings
tests/           vitest (151 testes)
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

## Onde mora cada regra (e por que não é tudo no mesmo lugar)

Instrução longa e uniforme dilui as regras duras — o modelo lê tudo com o mesmo
peso. A separação, que vale pra toda regra nova:

| Tipo de regra | Onde vive | Quem paga |
|---|---|---|
| **Método** — como investigar, em que ordem, o que nunca perguntar | system prompt do agente (`agents/analyzer.ts`, `agents/proposer.ts`) | todo card, uma vez |
| **Fato de plataforma** — armadilha do PowerBuilder, objeto compartilhado, regra de commit | `modules/<sistema>/CLAUDE.md` | todo card daquele sistema |
| **Fato de módulo** — objeto, tabela, caso resolvido | `modules/<módulo>/CLAUDE.md` | todo card do SMART Desktop (vão os seis juntos) |
| **Método do time** — o passo a passo daquele dev | skill, em Configurações → IA (`domain/skill.ts`) | todo card |

Duas consequências práticas: regra que vale pros dois sistemas vai no system
prompt (senão é escrita duas vezes e cobrada duas vezes), e conteúdo de módulo é
caro — `loadModuleContext('smartdesktop')` concatena **seis** briefings em cada
prompt.

A regra mais dura de todas, e a que mais custou até existir: **a IA não pergunta
ao dev nada que esteja em arquivo versionado.** "Me cola a seção X do `.srd`",
"qual janela abre esse pop-up", "quem chama essa função" — tudo isso é busca que
a esteira faz sozinha (`objectIndex.ts`, `sourceExcerpts.ts`). Pergunta sobre
código é proibida; sobre intenção, ambiente ou estado do `.pbl`, é permitida e
bem-vinda.

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
