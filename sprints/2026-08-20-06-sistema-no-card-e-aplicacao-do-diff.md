# Sistema no card e aplicação do diff pela IA

- **Data:** 2026-08-20
- **Solicitação:** "na parte do card, direcionar smart web e smart desktop" + "na etapa de revisão, caso o dev aceite a solução, a IA deve ser capaz de alterar o código"
- **Status:** concluído

## Parte 1 — o card escolhe o sistema, não o módulo

O dropdown listava `smartweb`, `atende`, `agenda`, `mwsus` e `cadgf` no mesmo
nível. Como ATENDE, AGENDA, MWSUS e CADGF são módulos acoplados **dentro** do
SMART Desktop, o card passou a perguntar só o **sistema**.

1. **`src/http/schemas.ts`**: `MODULES = ['smartdesktop', 'smartweb']`.
2. **`src/infra/moduleContext.ts`**: escolhido `smartdesktop`, o prompt recebe o
   briefing do sistema **mais** o dos quatro módulos acoplados, concatenados.
   Identificar o módulo virou parte da análise.
3. **`modules/smartdesktop/CLAUDE.md`** (novo): briefing do sistema — tabela de
   pistas para deduzir o módulo pelo texto do chamado, o que vale para todos
   (Oracle × SQL Server, parâmetros INI, objetos compartilhados, PFC).
4. **`web/lib/systems.ts`** (novo): opções e rótulos. Cards antigos gravados com
   `atende`/`agenda`/`mwsus`/`cadgf` continuam no board e aparecem como
   "ATENDE · SMART Desktop" em vez de um valor solto.
5. **`NewCardModal`**: campo renomeado para **Sistema**, com dica do que cada um
   cobre. `CardTile`, `CardDetail` e `BoardFilters` passaram a usar `systemLabel`.

## Parte 2 — a IA aplica o diff no código (REVISÃO)

6. **`src/infra/workspace.ts`** (novo): `applyDiff`, `revertDiff`,
   `checkWorkspace`, `parseDiffTargets`, `resolveInside`.
7. **Rotas** `POST /cards/:id/apply` e `POST /cards/:id/revert`: só em REVISÃO,
   só com diff proposto, 409 se já aplicado, 422 para falha de workspace.
   Cada ação vira entrada no histórico, com o dev que clicou e os arquivos.
8. **Persistência**: `Card.appliedAt`, `appliedFiles`, `appliedBackupDir`
   (migração `20260820140000_card_applied_diff`) + domínio e repositório.
9. **`src/infra/monitor.ts`**: recurso **Código (working copy)** — mostra se o
   caminho está configurado e gravável, testando com escrita real (montagem
   `:ro` só falha na hora de escrever).
10. **Docker**: `apk add patch` no Dockerfile do backend; compose monta
    `${SMART_DESKTOP_PATH}:/smart_desktop` **rw** (o pb-insight segue `:ro`) e
    cria o volume `applied_backups`.
11. **`CardDetail`**: botão "Aplicar o diff no código", separado de "Aceitar e
    resolver"; depois de aplicado, lista de arquivos alterados e "Desfazer
    alteração".
12. **`tests/workspace.test.ts`** (novo): 9 casos de parsing de diff e de
    barreira de caminho.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/src/infra/workspace.ts` | novo — apply/revert/health |
| `smart-ai-flow/src/infra/moduleContext.ts` | briefings compostos do SMART Desktop |
| `smart-ai-flow/src/infra/monitor.ts` | recurso "Código (working copy)" |
| `smart-ai-flow/src/infra/cardRepository.ts` | campos de apply |
| `smart-ai-flow/src/domain/card.ts` | campos de apply |
| `smart-ai-flow/src/http/routes.ts` | rotas apply/revert |
| `smart-ai-flow/src/http/schemas.ts` | `MODULES` = sistemas |
| `smart-ai-flow/prisma/schema.prisma` + migração | `appliedAt`, `appliedFiles`, `appliedBackupDir` |
| `smart-ai-flow/modules/smartdesktop/CLAUDE.md` | novo |
| `smart-ai-flow/tests/workspace.test.ts` | novo |
| `smart-ai-flow/Dockerfile` | `patch` |
| `docker-compose.yml` | montagem rw + volume de backups |
| `web/lib/systems.ts` | novo |
| `web/components/NewCardModal.tsx` | campo Sistema |
| `web/components/CardDetail.tsx` | aplicar/desfazer |
| `web/components/CardTile.tsx`, `BoardFilters.tsx` | rótulo do sistema |
| `web/lib/api.ts`, `web/lib/types.ts` | clientes e tipos |
| `README.md`, `smart-ai-flow/CLAUDE.md` | documentação da nova decisão |

## Decisões
- **A ressalva, registrada:** aplicar o diff automaticamente inverte a decisão
  central do projeto ("IA propõe, dev aplica", backend somente-leitura). Foi
  pedido explicitamente e está implementado; o que ficou no lugar da garantia
  antiga são as quatro abaixo.
- **Só por ação humana em REVISÃO.** O pipeline continua sem escrever: nenhuma
  rota chamada pelo orquestrador toca em arquivo.
- **Tudo ou nada.** `patch --dry-run` antes de qualquer escrita; se o real
  falhar depois de o dry-run passar, os arquivos voltam do backup.
- **Backup em volume próprio** (`applied_backups`), não dentro do working copy:
  não polui o `status` do controle de versão do dev, e dá "Desfazer" de um clique.
- **Nunca commitar.** O backend não fala com git/SVN. A mudança aparece como
  alteração local do dev — a rede de proteção final continua sendo dele.
- **Barreira de caminho.** Caminho absoluto ou com `..` é recusado: o diff é
  texto gerado por LLM a partir de chamado colado por humano.
- **`-p` descoberto por dry-run** (1, depois 0, depois 2): o diff do LLM às
  vezes vem estilo git (`a/`+`b/`), às vezes com caminho já relativo à raiz.
- **GNU `patch`, não `git apply`**: tolera deslocamento de contexto, comum em
  diff gerado por modelo. `git apply` recusaria os mesmos diffs.
- **Aplicar e resolver são botões separados** — aceitar a proposta e mandar
  escrever no código são duas decisões.

## Verificação
- `npm run typecheck` e `npm test` (backend): 6 arquivos, 39 testes passando.
- `npx tsc --noEmit`, `eslint` e `npm run build` (web): limpos.
- **Teste de ponta a ponta do apply dentro do container**, contra um working
  copy descartável (`/tmp/ws`): diff aplicado (`li_rc = 1` → `2`), arquivo
  restaurado byte a byte pelo revert, e diff com `../../etc/passwd` recusado
  sem escrever nada.
- Migração aplicada no restart (`All migrations have been successfully applied`),
  `patch` presente em `/usr/bin/patch`, `/smart_desktop` montado e gravável.
- `POST /cards/:id/apply` responde 401 sem token (rota registrada e protegida).
- **Não testei o fluxo completo pela UI** com um card real em REVISÃO — o apply
  foi exercitado direto no módulo, não pelo navegador.

## Pendências
- O working copy da máquina é **git**, não SVN como diziam o README e o
  `CLAUDE.md`. Os textos foram ajustados para "controle de versão", sem assumir
  um dos dois.
- Sem limite de tamanho de diff nem de número de arquivos por apply: hoje o
  limite prático é o que a proposta gera.
- O `patch` aplica com fuzz (deslocamento de contexto). Isso é o que faz diff de
  LLM funcionar, mas significa que uma alteração pode cair em bloco parecido ao
  invés do exato — o dev precisa conferir o resultado antes de resolver.
