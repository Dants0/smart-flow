# Credencial do MW desenv, validada na tabela usr do MW20

- **Data:** 2026-09-17
- **Solicitação:** "adicionar MW desenv na esteira de desenvolvimento do projeto e Credenciais do mw desenv, adicionar nas configurações, nessa etapa irá verificar se condiz com a tabela usr do banco MW20, caso o usuário exista no mw desenv, deve permitir que ele coloque para gerar a versão com as informações dele."
- **Esclarecimentos do usuário:** nesta etapa, só cadastrar a credencial nas configurações (o disparo da geração não entra); validar **login + senha**, e a senha é texto aberto; o passo fica **dentro de VERSIONAMENTO**; o banco do MW20 (SQL Server ou Oracle) não era conhecido.
- **Status:** concluído (sem teste contra o MW20 real)

## O que foi feito
1. **Regra conferida no fonte do SMART** (`w_ident_usr_nova.srw`, `w_acs02.srw`):
   colunas `usr_login`, `usr_senha`, `usr_status`; ativo é `'A'` **ou nulo**,
   inativo é `'I'`.
2. **Minha conta → MW desenv**: usuário e senha (cifrada). Ao salvar, o backend
   já confere na `usr`; o botão "Conferir no MW desenv" refaz depois. O estado
   (validada em / motivo da recusa) fica gravado e aparece na tela.
3. **Configurações → MW desenv** *(admin)*: conexão com o MW20 — banco (SQL
   Server/Oracle), host, porta (padrão 1433/1521), nome do banco ou service name,
   usuário e senha (cifrada) — com "Testar conexão".
4. **VERSIONAMENTO, novo passo 5 "Gerar versão no MW desenv"** (resolver virou o 6):
   com a credencial validada mostra com qual login a versão sairá; sem ela,
   explica o motivo e aponta para Minha conta. O botão "Gerar versão" existe mas
   está **desabilitado** — o disparo não faz parte desta etapa.
5. Drivers `mssql` e `oracledb` (modo thin, JS puro — nada de Oracle Instant
   Client na imagem).

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/src/domain/mwDesenv.ts` | novo — ativo, veredito, SQL por banco, conexão incompleta |
| `smart-ai-flow/src/infra/mw20.ts` | novo — SELECT na usr, validação do dev, teste do admin |
| `smart-ai-flow/tests/mwDesenv.test.ts` | novo — 12 testes |
| `smart-ai-flow/prisma/schema.prisma` + migração `20260917150000_credencial_mw_desenv` | `User.mw*` e `PlatformSettings.mw20*` |
| `smart-ai-flow/src/infra/userRepository.ts` | campos MW no `AuthUser`, `getMwCredentials`, `recordMwValidation` |
| `smart-ai-flow/src/infra/settingsRepository.ts` | conexão MW20 com senha cifrada |
| `smart-ai-flow/src/http/schemas.ts`, `routes.ts` | `PATCH /me` valida ao salvar, `POST /me/mw/test`, `POST /settings/mw20/test`; `settingsView` remove a duplicação das duas respostas de `/settings` |
| `smart-ai-flow/package.json` | `mssql`, `oracledb` (+ tipos) |
| `web/app/settings/mw/page.tsx`, `web/app/settings/layout.tsx` | página do admin e item no menu |
| `web/components/settings/MwDesenvCheck.tsx`, `web/app/settings/account/page.tsx` | seção do dev |
| `web/components/card/VersioningPanel.tsx` | passo 5 |
| `web/lib/api.ts`, `web/lib/auth.ts` | tipos e chamadas |
| `README.md`, `smart-ai-flow/CLAUDE.md` | documentação |

## Decisões
- **Banco fora do ar não invalida a credencial.** Falha de conexão/configuração é
  `Mw20IndisponivelError` (502) e não mexe no estado gravado; só uma recusa real
  (login inexistente, inativo, senha) grava o motivo e tira a validação.
- **Salvar outra coisa não derruba a validação**: a tela manda o usuário do MW em
  todo salvar, e só um valor diferente conta como troca.
- **Senha comparada exata**, sem `trim` na gravação; só o espaço à direita cai na
  comparação (coluna `CHAR` completa com espaços). Login com `UPPER` dos dois
  lados, para valer igual em Oracle e SQL Server.
- **Parâmetro nomeado sempre** — o login digitado nunca entra concatenado no SQL.
- **Ordem da recusa**: inexistente → inativo → senha, para não mandar redigitar a
  senha de um usuário inativo.
- **Conexão aberta e fechada por consulta**, sem pool: validação é evento raro, e
  pool parado seria conexão ociosa num banco de outro time.
- **Admin configura a conexão pela tela**, não por `.env`: segue o resto da
  plataforma (config no banco, vale na hora).

## Verificação
- Backend: 247 testes verdes, `typecheck` e `prisma validate` limpos. Numa das
  execuções um teste já existente falhou uma vez e passou nas três seguintes — o
  mesmo padrão intermitente já registrado em 2026-09-16-02.
- Web: `tsc` e `eslint` limpos.
- Drivers conferidos em runtime: carregam em ESM e falham de forma limpa contra
  host inalcançável (`ESOCKET`, `NJS-515`).
- **Não testado contra o MW20 real** — nem a conexão, nem a comparação de senha
  com dados de verdade.

## Pendências
- **Integrar o disparo da geração de versão** (o botão do passo 5 está desabilitado).
- Admin preencher a conexão do MW20 e testar; depois cada dev cadastrar a credencial.
- **Senha "texto aberto" contra o fonte**: o SMART grava `usr_senha` com
  `sSenhaCripto` em `w_ident_usr_nova.srw`/`w_usr02.srw`. Se no MW desenv a
  senha estiver cifrada, toda validação vai recusar com "senha incorreta" — aí a
  comparação precisa replicar a criptografia do SMART.
- Reconstruir `backend` e `web` (`docker compose up -d --build backend web`).
