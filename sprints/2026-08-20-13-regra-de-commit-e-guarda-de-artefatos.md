# Regra de commit do SMART Desktop e guarda de artefatos

- **Data:** 2026-08-20
- **Solicitação:** correção do texto "SVN" no código (item 1 aprovado) + "só deve commitar o arquivo que for alterado, nunca .pbl — All None > seleciona somente o que alterou > `:bug:fix SMART-XXXXX`; pbl, pbw, pbd não sobem; só sru, sra, srd, srw"
- **Status:** concluído (a esteira de Versionamento em si ficou aguardando decisões — ver Pendências)

## O que foi feito
1. **Texto neutro de VCS**: as três menções a "SVN" em `workspace.ts` e
   `routes.ts` passaram a falar em "controle de versão"/"working copy". O
   repositório da máquina é git (Bitbucket), não SVN.
2. **`classifyPath()`** em `workspace.ts`: classifica caminho em `fonte`
   (`.sru`, `.sra`, `.srd`, `.srw`), `proibido` (`.pbl`, `.pbw`, `.pbd`) ou
   `outro`.
3. **Guarda no `applyDiff`**: diff que toque em artefato de build é recusado
   **antes** de copiar backup ou escrever qualquer coisa, com a lista dos
   arquivos ofensores. O `patch --dry-run` passaria feliz por cima de um `.pbl`.
4. **A regra entrou no prompt do proposer**: o modelo é instruído a só alterar
   fontes exportados e avisado de que a plataforma recusa o diff se tocar em
   binário — melhor não gerar do que gerar e ser barrado.
5. **`modules/smartdesktop/CLAUDE.md`**: seção "O que se altera (e o que nunca
   se altera)", para valer em toda análise do sistema.
6. **Memória persistente** (`regra-commit-smart-desktop`): a regra vale entre
   sessões, não só nesta conversa.
7. **`tests/workspace.test.ts`**: 5 casos novos, incluindo a armadilha real do
   repositório — `ws_objects/Audit50/audit50.pbl.src/d_aud01tab.srd` é **fonte**,
   apesar de ter `.pbl` no caminho. Uma checagem por `includes('.pbl')` teria
   bloqueado praticamente todo o codebase.

## Levantamento do repositório (base para a esteira de Versionamento)
| Fato | Fonte |
|---|---|
| Remote **Bitbucket Cloud** `pixeon/smart_desktop` | `git remote -v` |
| Branch atual `bug/SMART-50927`; existem `feature/SMART-XXXXX` | `git branch -a` |
| `ws_objects/**` versionado: 15.985 arquivos | `git ls-files` |
| Último commit tocou `.sru` e `.pbr` | `git show --stat HEAD` |
| Working copy com **35 arquivos sujos**, vários `.pbl` | `git status --porcelain` |
| Convenção de mensagem: `:bug: fix: SMART-51635 <descrição>` | `git log` |

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/src/infra/workspace.ts` | `classifyPath` + guarda no apply + texto de VCS |
| `smart-ai-flow/src/http/routes.ts` | texto de VCS |
| `smart-ai-flow/src/agents/proposer.ts` | regra no system prompt |
| `smart-ai-flow/modules/smartdesktop/CLAUDE.md` | seção sobre fontes × artefatos |
| `smart-ai-flow/tests/workspace.test.ts` | 5 casos novos |

## Decisões
- **Bloquear no apply, não só no commit.** A esteira de Versionamento ainda não
  existe, mas o "aplicar diff" já escreve em arquivo desde hoje de manhã —
  a regra vale a partir de agora, não a partir da feature futura.
- **Denylist bloqueia; allowlist só classifica.** `.pbl/.pbw/.pbd` recusa;
  `.sru/.sra/.srd/.srw` é fonte; o resto vira `outro` em vez de ser barrado —
  `.pbr` aparece em commit real do repositório, então bloquear seria errado.
- **Extensão pelo fim do caminho, nunca por `includes`.** O layout do repo é
  `<lib>.pbl.src/<objeto>.sru`: procurar `.pbl` no caminho inteiro bloquearia o
  codebase todo. Tem teste cravando isso.
- **A regra também vai pro prompt.** Barrar depois desperdiça uma proposta
  inteira; o modelo saber antes é mais barato e dá diff melhor.

## Verificação
- `npm run typecheck`: limpo. `npm test`: 8 arquivos, **64 testes** (5 novos).
- Backend reconstruído com a guarda ativa.
- **Não exercitei um diff com `.pbl` de ponta a ponta pela UI** — a recusa está
  coberta por teste unitário no classificador, não pela tela.

## Pendências — a esteira de Versionamento depende de três respostas
1. **Credencial do Bitbucket**: App Password por dev (cifrado, como o Jira) ou
   token único da plataforma? Recomendo por dev, para commit e PR serem dele.
2. **Identidade do commit**: hoje não há nome/e-mail git por usuário. Criar os
   campos em Minha conta?
3. **Instância por dev ou compartilhada?** Existe **um** `SMART_DESKTOP_PATH`.
   Se a plataforma for compartilhada, commitar/pushar mexe no checkout de uma
   pessoa só, com os arquivos sujos dela — o desenho teria que mudar (clone
   isolado por card).

Também em aberto: `.pbr` entra ou não no commit (aparece no histórico real, mas
não está na lista que você passou).
