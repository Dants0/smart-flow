# Template do Jira, dois repositórios e roteamento de sistema

- **Data:** 2026-08-21
- **Solicitação:** análise das skills `analisar-chamado` do gestor; "pode corrigir a prioridade 1"; repo do smart_web está em `C:\smart_web\smart_web`; "o 3 também pode prosseguir"; e analisar os `CLAUDE.md` priorizando o do repositório do SMART Desktop
- **Status:** concluído (código); a análise do `CLAUDE.md` do repo do SMART foi entregue como proposta, sem alterar o repositório de vocês

## Prioridade 1 — template do Jira corrigido
O template que eu tinha implementado divergia do real em cinco pontos:

1. **Wiki markup**: títulos agora saem como `*MÓDULOS IMPACTADOS:*` — sem os
   asteriscos o Jira Server renderiza tudo como texto corrido.
2. **`*CAUSA RAIZ:*`**: campo que não existia. Preenchido só quando o chamado
   causador é conhecido; em branco caso contrário, nunca palpite.
3. **`*EVIDÊNCIAS:*`** com `BASE LOCAL:` e `BASE CLIENTE:`, e referência
   automática aos anexos `ok_base_local` / `ok_base_cliente` do chamado no
   formato `!arquivo.png|thumbnail!`.
4. **MÓDULOS IMPACTADOS** no vocabulário do time (`-ATENDE`, `-SMARTWEB`),
   deduzido da biblioteca do arquivo alterado.
5. **OBJETOS ALTERADOS** com o caminho completo do repositório, não o formato
   `objeto (biblioteca)` que eu tinha inventado.

Extra: **`buildSupportComment()`** para o caso "sem alteração de código" — o
comentário não técnico orientando o suporte, que a skill do gestor prevê e a
plataforma não tinha.

## Prioridade 2 — dois repositórios
6. **`infra/repos.ts`** (novo): configuração por sistema — raiz, rótulo, raiz dos
   fontes e "companheiro" de arquivo. `repoForModule()` resolve o repositório a
   partir do módulo do card (legado continua no desktop).
7. **`workspace.ts`, `git.ts`, `objectIndex.ts`** deixaram de ler
   `SMART_DESKTOP_PATH` direto: todas as operações recebem o repositório. O
   índice de objetos passou a ser um por repo.
8. **`.prp` do smart_web**: 9.619 arquivos versionados, um por fonte.
   `withCompanions()` inclui o `.sru.prp` junto do `.sru` no preview do commit —
   commitar um sem o outro é erro silencioso.
9. **Fonte virou `.sr?`**: a lista fechada (`sru/sra/srd/srw`) deixava de fora
   **`.srf` (1.808 arquivos no desktop)**, `.srm` e `.srs`, que também são código
   versionado. A skill do gestor já dizia `.sr*`.
10. **compose/env**: `SMART_WEB_PATH` montado em `/smart_web`, e o monitor passou
    a mostrar **um recurso por repositório** (`Código · SMART Desktop`,
    `Código · SMART Web`), cada um com a branch atual.

## Prioridade 3 — roteamento e briefings
11. **Regra de roteamento no prompt do analyzer**: SMARTWEB/WEBLAUDOS → SMART
    Web; ATENDE, CADGF, AGENDA, PACDEL, CIRURG sem menção a web → SMART Desktop.
    Card classificado no sistema errado deve ser denunciado em `reasoning[0]`.
12. **Briefings de PACDEL e CIRURG** criados e incluídos na composição do
    SMART Desktop (antes só atende, agenda, mwsus, cadgf).
13. Regra nova no analyzer: **citar em `affectedObjects` só objeto que apareceu
    no contexto** — o resto vai como hipótese em `reasoning`.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `src/infra/repos.ts` | novo — configuração dos dois repositórios |
| `src/domain/jiraComment.ts` | template real + comentário de suporte |
| `src/infra/workspace.ts`, `git.ts`, `objectIndex.ts` | operam por repositório |
| `src/infra/monitor.ts` | um recurso por repositório |
| `src/infra/moduleContext.ts` | PACDEL e CIRURG na composição |
| `src/agents/analyzer.ts` | roteamento + honestidade em affectedObjects |
| `src/http/routes.ts` | passa o módulo do card nas operações de repo |
| `modules/pacdel/CLAUDE.md`, `modules/cirurg/CLAUDE.md` | novos |
| `docker-compose.yml`, `.env`, `.env.example` | `SMART_WEB_PATH` |
| `tests/versioning.test.ts` | template novo, `impactedModules`, evidências |

## Decisões
- **`.sr?` em vez de lista fechada.** Confirmei no repositório: `.srf` tem 1.808
  arquivos no desktop e 1.600 no web. Bloquear/desmarcar `.srf` seria pior que o
  problema que a regra tenta evitar.
- **`.prp` entra junto, não pergunta.** É companheiro obrigatório do fonte no
  smart_web; deixar o dev lembrar é garantir PR incompleto.
- **CAUSA RAIZ em branco por padrão.** Mesma regra das EVIDÊNCIAS: campo que
  afirma algo que ninguém verificou é pior vazio do que chutado.
- **Repositório escolhido pelo módulo do card**, não por configuração global —
  é o card que sabe se é web ou desktop.

## Verificação
- `npm run typecheck` e `npm test`: 9 arquivos, **86 testes** (4 novos), verdes.
- Backend reconstruído; **os dois working copies respondem dentro do container**:
  `/smart_desktop` em `bug/SMART-50927` e `/smart_web` em `bug/SMART-51831`,
  30.128 arquivos indexáveis no web.
- **Não exercitei o fluxo de versionamento no smart_web** — nenhum commit, push
  ou PR foi feito em nenhum dos dois repositórios.
- Front ainda **não** foi rebuildado nesta rodada (nada mudou na UI além do que
  já estava no ar).

## Pendências
- O texto do comentário do Jira ganhou campos novos, mas a tela do
  `VersioningPanel` ainda não tem campo para o dev informar a **CAUSA RAIZ**
  (chamado causador) — hoje só dá pra digitar direto no texto do comentário.
- `buildSupportComment()` existe mas ainda não tem entrada na UI (caso "sem
  alteração de código").
- Briefings de PACDEL e CIRURG estão em esqueleto, com os `<!-- preencher -->`.
