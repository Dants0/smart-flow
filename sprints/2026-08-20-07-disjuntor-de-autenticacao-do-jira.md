# Disjuntor de autenticação do Jira (CAPTCHA)

- **Data:** 2026-08-20
- **Solicitação:** "o Jira tá obrigando meu usuário a colocar o captcha... será que a Atlassian está barrando minha basic auth? refiz login mas continua" → "sim, implemente"
- **Status:** concluído

## Diagnóstico
1. **Não é a Atlassian.** `GET /rest/api/2/serverInfo` (sem credencial) devolveu
   `version 8.0.2`, `deploymentType: "Server"`. A remoção do Basic Auth com
   senha foi política de **Cloud**; em Server ela segue suportada — e PAT só
   existe da 8.14 em diante, então nem haveria alternativa nesta instância.
   O que age é o **CAPTCHA do Seraph**, do próprio Jira Server: após N logins
   falhados ele nega toda autenticação por REST, mesmo com a senha correta.
2. **Por que "refiz login e continua":** os logs do backend mostravam
   `/jira/pending → 502` a cada ~60s. O board consulta o Jira **a cada 60
   segundos, por aba aberta**; com credencial recusada, são três logins
   falhados em três minutos — o gatilho do CAPTCHA. O dev destravava no
   navegador e a própria plataforma rearmava o bloqueio minutos depois.
   (Segunda armadilha, do lado do usuário: abrir o Jira com sessão válida não
   zera o contador — é preciso deslogar e passar pelo formulário.)

## O que foi feito
3. **`classifyDenial(status, header)`** em `jiraService.ts`: função pura que
   separa **negação** (CAPTCHA pelo header `x-authentication-denied-reason`, ou
   401) de **indisponibilidade** (5xx, 403, timeout). A distinção é a regra do
   disjuntor: indisponibilidade passa sozinha e vale insistir; negação não passa
   e insistir piora.
4. **`JiraAuthError`** com `code: 'CAPTCHA' | 'UNAUTHORIZED'` e mensagem que diz
   o passo a passo de destravar.
5. **Bloqueio persistido** — `User.jiraAuthBlockedAt` e `jiraAuthBlockedReason`
   (migração `20260820170000_jira_auth_block`). Ao detectar negação, o backend
   grava a marca; `jiraContext` passa a recusar **antes de abrir conexão**.
   Nenhuma tentativa a mais chega ao Jira.
6. **Liberação**: regravar usuário ou senha em Minha conta limpa a marca
   automaticamente; `POST /me/jira/unblock` cobre quem só resolveu o CAPTCHA no
   navegador e não trocou credencial.
7. **Rotas**: `/jira/pending` e `/jira/:key` respondem **428 `JIRA_AUTH_BLOCKED`**
   em vez do 502 genérico de "Jira fora do ar".
8. **`ApiError`** no cliente web, preservando o `code` — a UI decide pelo código,
   não pelo texto da mensagem.
9. **`JiraBlockedBanner`** (novo): banner no board explicando o bloqueio, com
   "Já destravei, tentar de novo" e atalho para regravar a senha. O **polling de
   60s para** enquanto estiver bloqueado.
10. **Página Minha conta**: aviso no grupo de credenciais do Jira, com data da
    recusa — salvar a senha ali é o que libera.
11. **`trim()` nas credenciais do Jira** ao salvar: senha colada com espaço no
    fim falha o Basic Auth de um jeito que parece "senha errada" e ninguém acha
    olhando o campo.
12. **`tests/jira.test.ts`** (novo): 6 casos da regra de classificação.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/src/infra/jiraService.ts` | `classifyDenial`, `JiraAuthError`, disjuntor |
| `smart-ai-flow/src/infra/userRepository.ts` | block/clear/get, trim, `jiraAuthBlocked` no AuthUser |
| `smart-ai-flow/src/http/routes.ts` | 428 `JIRA_AUTH_BLOCKED` + `POST /me/jira/unblock` |
| `smart-ai-flow/prisma/schema.prisma` + migração | `jiraAuthBlockedAt`, `jiraAuthBlockedReason` |
| `smart-ai-flow/tests/jira.test.ts` | novo |
| `web/lib/api.ts` | `ApiError` com `code`, `unblockJira()` |
| `web/lib/auth.ts` | `jiraAuthBlocked` no `AuthUser` |
| `web/components/JiraBlockedBanner.tsx` | novo |
| `web/app/page.tsx` | banner + polling suspenso enquanto bloqueado |
| `web/app/settings/account/page.tsx` | aviso no grupo de credenciais |

## Decisões
- **Falhar fechado, não repetir.** Diante de negação a plataforma para. O custo
  de errar para o outro lado não é um erro na tela: é a conta do dev travada no
  Jira da empresa.
- **Negação ≠ indisponibilidade.** 5xx e 403 continuam sendo tratados como ruído
  transitório; só CAPTCHA e 401 acionam o disjuntor. Bloquear em 5xx suspenderia
  o Jira do dev por instabilidade do servidor.
- **Bloqueio por usuário, no banco.** Em memória, ele sumiria no restart — e o
  primeiro poll depois do restart recomeçaria o ciclo. Por usuário porque a
  credencial é por usuário: a senha errada de um dev não pode suspender o Jira dos outros.
- **Duas formas de liberar**, porque são dois cenários: quem trocou a senha
  (salvar em Minha conta) e quem só resolveu o CAPTCHA (botão no banner).
- **Header antes do status.** O Jira Server responde CAPTCHA às vezes com 200;
  classificar só por status deixaria passar como sucesso.

## Verificação
- `npm run typecheck`, `npm run build` e `npm test` (backend): 7 arquivos,
  45 testes passando (6 novos).
- `tsc --noEmit`, `eslint` e `npm run build` (web): limpos.
- Migração aplicada no restart; colunas `jiraAuthBlockedAt` e
  `jiraAuthBlockedReason` conferidas no Postgres.
- **Não exercitei o caminho com o Jira real** — fazer isso exigiria provocar de
  propósito uma negação na conta do dev, que é justamente o que trava a conta.
  A regra de decisão está coberta por teste unitário; o efeito prático se
  confirma na próxima recusa real.

## Pendências
- O disjuntor cobre o Jira. Nada equivalente existe para outras integrações.
- Não há expiração automática do bloqueio (ex.: liberar sozinho após X horas) —
  hoje só sai por ação do dev, que é o comportamento seguro.
