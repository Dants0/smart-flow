# Recuperar a senha da plataforma (versão provisória, assumida)

- **Data:** 2026-08-28
- **Solicitação:** "a plataforma já possui uma forma de recuperar a senha?" → não possuía. "crie uma telinha simples porque essa aplicação ainda está rodando internamente, só passar o nome de usuário e nova senha já deve poder alterar, depois desenvolvemos algo mais complexo e correto"
- **Status:** concluído, com dívida declarada (ver Pendências)

## O que existia antes

Nada de recuperação. O que havia era `PATCH /me` com `password` — que é
**trocar**, não recuperar: exige estar logado, então quem esqueceu a senha nunca
chega nele. O `User` não tem campo de token nem de expiração, e a tela de login
não tinha link nenhum. Na prática, quem esquecia a senha voltava por `psql` — ou
o admin apagava e recriava a conta, o que é pior do que parece: `Card.createdById`
e o histórico apontam pro usuário, então apagar mexe em registro de trabalho pra
resolver problema de senha.

## O que foi feito

`POST /auth/reset-password` (público): nome de usuário + senha nova, e pronto.
Tela em `/recuperar-senha`, com link "Esqueci minha senha" no login — que só
aparece fora do bootstrap, onde não existe senha a recuperar. A tela pede a
senha duas vezes (errar aqui vira a senha da conta na hora, e o dono só
descobriria no login seguinte) e já entra na plataforma depois de trocar: quem
acabou de escolher a senha não precisa digitá-la de novo na tela ao lado.

`resetPasswordByUsername` zera `mustChangePassword` pelo mesmo motivo que
`updateUser` faz: quem acabou de escolher a senha não deve ser cobrado a
escolher outra no próximo login.

Cada troca sai no log do backend com usuário e IP (`req.log.warn`) — é a única
trilha que existe se alguém usar isto pra entrar na conta de outro.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/src/http/routes.ts` | rota pública `POST /auth/reset-password`, com o alerta escrito por extenso |
| `smart-ai-flow/src/http/schemas.ts` | `ResetPasswordSchema` (usuário + senha de 8+) |
| `smart-ai-flow/src/infra/userRepository.ts` | `resetPasswordByUsername` |
| `web/app/recuperar-senha/page.tsx` | novo — a tela, com o aviso do que ela é |
| `web/app/login/page.tsx` | link "Esqueci minha senha" |
| `web/lib/api.ts` | `resetPassword` + a rota na lista de públicas |

## Decisões

- **Sem autenticação nenhuma, deliberadamente.** Foi o pedido, com o contexto de
  que a aplicação roda internamente e que a versão correta vem depois. O risco
  está escrito em três lugares — no comentário da rota, na tipagem do front e na
  própria tela — justamente pra não virar dívida invisível.
- **Erro claro quando o usuário não existe** (404 "usuário não encontrado"), em
  vez do silêncio que se usa pra não vazar quem tem conta. Esconder não protege
  nada aqui: qualquer um já pode trocar a senha de qualquer conta por esta porta,
  e a mensagem vaga só atrapalharia quem errou o próprio nome de usuário.
- **Não mexi no que não foi pedido.** Ficaram de fora, por escolha do
  solicitante: exigir a senha atual no `PATCH /me` e rate limit no `/auth/login`.

## Pendências

**Esta rota não pode sair da rede interna como está.** Qualquer pessoa que a
alcance troca a senha de qualquer conta, inclusive a de admin. Antes de expor a
aplicação, uma das duas resolve:

1. **Reset por admin autenticado** (`POST /users/:id/reset-password`): gera senha
   provisória e liga `mustChangePassword`, caindo no fluxo de primeiro acesso que
   já existe e está testado. É o caminho mais curto, e cobre quase todos os casos.
2. **Token de uso único por e-mail**: exige campo de e-mail de conta no `User`
   (hoje só há `gitEmail`/`bitbucketEmail`, que são de commit) e SMTP, que a
   stack não tem.

Fica um furo mesmo com a opção 1: se o **único admin** esquecer a senha, não
sobra ninguém pra redefinir — daí valer um comando de linha no servidor como
escape.

Outras duas, anotadas e não tratadas: `PATCH /me` troca a senha **sem pedir a
senha atual** (sessão roubada = conta tomada) e `/auth/login` não tem rate limit.
