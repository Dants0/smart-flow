# Esteira de Versionamento (commit, PR e comentário no Jira)

- **Data:** 2026-08-20
- **Solicitação:** nova etapa "Versionamento" — verificar branch `bug/SMART-XXXXX`, commitar só o que mudou, push, abrir PR e comentar no Jira no template do time; "pode seguir com as recomendações"; "alerte o dev quando aparecer artefato estranho"; e depois: "adicione nas configurações o que for necessário para integrar com o Bitbucket, ou checar no Monitor de Recursos"
- **Status:** concluído (implementado e no ar; ver Verificação para o que **não** foi exercitado)

## O que foi feito

### Domínio
1. **Estágio `VERSIONAMENTO`** entre REVISÃO e RESOLVIDO, dono DEV. Transições:
   `REVISAO → VERSIONAMENTO | RESOLVIDO | DESENVOLVIMENTO` e
   `VERSIONAMENTO → RESOLVIDO | DESENVOLVIMENTO` (PR recusado volta pra proposta).
2. **`domain/jiraComment.ts`**: monta o template do time. `describeObject()`
   traduz `ws_objects/Mwsus50/mwsus50.pbl.src/w_aih.srw` em `w_aih (mwsus50)`.

### Git (`infra/git.ts`)
3. `previewCommit()` — branch atual × esperada, `git status` cruzado com os
   arquivos que o apply gravou no card, classificação por extensão e contagem do
   que está sujo mas não é da correção.
4. `commitFiles()` — `git add` só dos escolhidos + `commit --only`, com
   `-c user.name/-c user.email` do dev. Recusa artefato de build **de novo** no
   backend e recusa branch errada.
5. `pushBranch()` — injeta a credencial na URL só na chamada; nada vai pro
   `.git/config`.
6. `redactUrlCredentials()` — o git repete a URL do remote em quase todo erro de
   push, e a nossa carrega a app password. Todo erro passa por aqui antes de
   virar log, histórico ou tela.

### Bitbucket (`infra/bitbucket.ts`)
7. `createPullRequest()` (API 2.0), `findOpenPullRequest()` (não duplica PR se o
   dev clicar duas vezes) e `checkRepositoryAccess()` (teste e monitor).

### Jira
8. `addJiraComment()` — `POST /rest/api/2/issue/{key}/comment`, passando pelo
   mesmo disjuntor de CAPTCHA das outras chamadas.

### Rotas
9. `GET /cards/:id/versioning`, `POST /cards/:id/commit`,
   `POST /cards/:id/pull-request`, `GET|POST /cards/:id/jira-comment`,
   `POST /me/bitbucket/test`.

### Credenciais e monitor
10. **Por dev** (`User`): `gitName`, `gitEmail`, `bitbucketUser` e
    `bitbucketAppPasswordEnc` (cifrada, mesmo esquema da senha do Jira).
11. **Monitor de Recursos**: recurso **Bitbucket (versionamento)** — sem
    credencial não é falha (versionar pela plataforma é opcional); com
    credencial, testa acesso ao repositório do `origin`. O recurso "Código
    (working copy)" passou a mostrar **a branch atual**.
12. **Minha conta**: grupo "Versionamento (Bitbucket)" com os quatro campos, o
    passo a passo de criar a app password e **Testar conexão**.

### Interface do card
13. **`VersioningPanel`**: lista cada arquivo com status e classificação —
    fonte marcado, artefato de build **bloqueado sem checkbox**, extensão fora do
    padrão **desmarcada com aviso**. Depois do commit vira o painel de push/PR e,
    em seguida, o editor do comentário de entrega.

## Decisões
- **A tela existe para ser lida, não aceita.** O gatilho foi você contar que seu
  gestor fez commit, push e PR "só aceitando" sem saber o que estava fazendo.
  Por isso a lista mostra arquivo, status e classificação antes do primeiro
  clique, e nada fora do padrão entra marcado.
- **A regra é aplicada duas vezes.** A UI filtra e o backend recusa de novo no
  `commitFiles` — a garantia não pode depender de a tela ter feito o trabalho.
- **Verificar a branch, nunca trocar.** O working copy tem 35 arquivos sujos de
  quem está na máquina; `git checkout` ali destruiria trabalho alheio.
- **Commit e PR saem como o dev.** Credencial e identidade por usuário. Um robô
  assinando entrega em repositório de produção some com a rastreabilidade.
- **`.pbr` e afins alertam, não bloqueiam.** Sua lista de permitidos tem quatro
  extensões, mas `.pbr` aparece em commit real do repositório — então ele entra
  como "fora do padrão", desmarcado e com aviso, exatamente como você pediu.
- **EVIDÊNCIAS sempre em branco.** É prova de teste executado. A plataforma não
  testou nada, e preencher isso seria a ferramenta afirmando algo falso dentro
  do Jira da empresa. Tem teste cravando que a seção termina vazia.
- **PR reaproveitado, não duplicado** — clicar duas vezes é o comportamento
  normal de quem não tem certeza se o primeiro clique funcionou.

## Verificação
- `npm run typecheck`, `npm test` (backend): 9 arquivos, **81 testes** (20 novos
  cobrindo convenção de branch e mensagem, redação de credencial, transições do
  novo estágio e o template do Jira).
- `tsc --noEmit`, `eslint`, `npm run build` (web): limpos.
- Migração `20260820190000_versionamento` aplicada; enum no Postgres confirmado
  com `VERSIONAMENTO` entre REVISAO e RESOLVIDO.
- `git 2.54` instalado na imagem do backend, lendo o working copy montado
  (`branch --show-current` → `bug/SMART-50927`).
- Rotas registradas e protegidas (401 sem token).
- **NÃO exercitei o fluxo real**: nenhum commit, push, PR ou comentário no Jira
  foi executado. Isso escreve no repositório de produção de vocês e no chamado —
  não é coisa que eu faça sem você pedir. O primeiro uso é o teste de verdade.

## Pendências e riscos conhecidos
- **Um working copy só.** Se a plataforma for compartilhada entre devs, o commit
  sai no checkout de quem hospeda. Assumi instância por dev, como combinado.
- **Destino do PR fixo em `main`.** É o default do repositório; se algum PR
  precisar sair contra `build/*`, vira campo na tela.
- **Sem verificação de estado do PR.** O card não sabe se o PR foi aprovado ou
  recusado — sair de VERSIONAMENTO é ação manual do dev.
- O `git commit --only` falha se houver conflito de merge em andamento; o erro
  do git é repassado, mas não há tratamento específico.
