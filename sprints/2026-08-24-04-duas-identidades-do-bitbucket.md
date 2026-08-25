# Bitbucket: separar a identidade da API da identidade do Git

- **Data:** 2026-08-24
- **Solicitação:** "onde achar isso no bitbucket?" (app password) → "ajuste então"
- **Status:** concluído — pendente de migração no banco e rebuild dos containers

## O que motivou

O dev foi configurar o versionamento e descobriu que **App passwords não existe
mais** no Bitbucket: a Atlassian descontinuou e substituiu por API tokens
(`id.atlassian.com` → Security → API tokens, app **Bitbucket**).

A documentação do token é explícita e foi o que revelou o bug:

> Você vai precisar do token de API e do seu **endereço de e-mail** do Bitbucket
> para as APIs do Bitbucket. Você vai precisar do token de API e do seu **nome
> de usuário** do Bitbucket para os comandos do Git.

O backend usava **um campo só** (`bitbucketUser`) nas duas pontas:

- `bitbucket.ts:29` — `Basic base64(user:senha)` na API REST → precisa do e-mail
- `git.ts:199` — `https://user:senha@...` no push → precisa do username

Com app password o username servia para os dois, então isso nunca apareceu. Com
API token não existe valor único que funcione: ou o push falha, ou o PR falha.

## O que foi feito

1. **Migração** `20260824180000_bitbucket_email` — coluna `bitbucketEmail`
   nullable em `User`.
2. **`domain/bitbucketIdentity.ts`** — `bitbucketApiIdentity(user, email)`,
   com fallback para o username quando o e-mail está vazio.
3. **`getBitbucketCredentials`** passa a devolver `{ user, email, appPassword }`.
4. **`authHeader`** usa `email`; **`pushBranch`** segue com `user`. Ambos com
   comentário explicando por quê, para ninguém "simplificar" isso de volta.
5. **Mensagens de erro** reescritas: o 401 do teste de conexão e o do
   `createPullRequest` agora dizem *qual campo* conferir; o 404 aponta escopo.
6. **Formulário** — campo "E-mail da conta Atlassian", texto de ajuda refeito
   (mandava o dev num caminho que não existe mais) e `bitbucketDirty` passa a
   considerar o e-mail.
7. **6 testes** em `tests/bitbucketIdentity.test.ts` (120 no total, era 114).

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | coluna `bitbucketEmail` + comentário das duas identidades |
| `prisma/migrations/20260824180000_bitbucket_email/` | nova migração |
| `src/domain/bitbucketIdentity.ts` | novo — regra de qual identidade autentica o quê |
| `src/infra/userRepository.ts` | persiste e devolve as duas identidades |
| `src/infra/bitbucket.ts` | `authHeader` usa e-mail; mensagens de 401/403/404 |
| `src/infra/git.ts` | comentário fixando que o push usa o username |
| `src/http/schemas.ts` | `bitbucketEmail` com validação de e-mail |
| `web/lib/auth.ts`, `web/lib/api.ts` | tipo `AuthUser` e patch |
| `web/app/settings/account/page.tsx` | campo novo, ajuda reescrita, dirty check |
| `tests/bitbucketIdentity.test.ts` | novo — 6 testes |
| `CLAUDE.md` | estrutura + contagem de testes |

## Decisões

- **Campo novo em vez de reaproveitar o "E-mail no commit".** Coincidem hoje,
  mas são coisas diferentes: um é identidade Git (pode ser alias do time), o
  outro é a conta Atlassian. Conflatar só falharia no dia em que alguém usasse
  um diferente — e o sintoma seria 401 sem explicação.
- **Fallback do e-mail para o username.** Quem ainda tem app password
  configurada continua funcionando sem tocar em nada; a coluna nullable não
  exige backfill.
- **A regra virou domínio, não helper de infra.** "Qual identidade autentica o
  quê" é regra de negócio da integração e o `CLAUDE.md` exige teste para
  regra que decide — em `domain/` ela é testável sem subir Prisma.
- **Escopos mínimos documentados na tela:** `read/write` de `repository` e de
  `pullrequest`. Nada de `admin:*` nem `delete:*` — o token fica guardado num
  sistema que roda automação sobre o repositório da empresa.

## Pendências

- **Rodar a migração e reconstruir os containers**
  (`docker compose up -d --build backend web`) — o backend aplica
  `prisma migrate deploy` no start.
- O dev precisa **preencher o e-mail** na tela; sem isso o fallback mantém o
  comportamento antigo, que com API token dá 401 na API.
- Continuam abertas: correção nos 6 `.srw` do `mwsus` (SMART-50927) e rebuild
  do pb-insight para o endpoint `/siblings`.
