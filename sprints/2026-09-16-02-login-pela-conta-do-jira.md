# Login pela conta do Jira

- **Data:** 2026-09-16
- **Solicitação:** "Logar também o login pelo próprio Jira, não precisa mais criar uma conta diretamente na plataforma, basta colocar user e senha propriamente do JIRA. Pode levar em consideração agora que a url de instância por padrão é a https://portalcliente.pixeon.com assim não precisa mais ter contas diferentes ou criar conta na plataforma, logou no jira? aquele usuário existe e pode deixar seguir o fluxo normalmente."
- **Status:** concluído (sem teste contra o Jira real)

## O que foi feito
1. **`POST /auth/login` confere a senha no Jira** (`GET /rest/api/2/myself` com
   Basic Auth). Autenticou → a conta local é vinculada ou criada na hora, com o
   `displayName` do Jira, e a senha digitada vira a credencial da esteira (cifrada,
   como antes). Logar também libera o bloqueio de CAPTCHA, se houver.
2. **Sem bootstrap e sem cadastro.** A rota `/auth/bootstrap` e o formulário de
   "criar administrador" saíram; o **primeiro** a entrar pelo Jira vira admin.
   `/auth/status` passou a devolver a URL do Jira, que a tela de login mostra.
3. **URL padrão `https://portalcliente.pixeon.com`**: vale sempre que não há URL
   gravada. `JIRA_BASE_URL` no ambiente sobrescreve (homologação); a tela
   Configurações → Jira continua podendo trocar.
4. **Mensagens de erro separadas**: senha recusada (avisando do CAPTCHA),
   CAPTCHA exigido (resolver no navegador) e Jira fora do ar/URL errada (503) —
   este último nunca aparece como "senha errada".
5. **Tela de login** pede "Usuário do Jira / Senha do Jira", sem o link de
   recuperação de senha (substituído por "recupere pelo próprio Jira").
6. **Minha conta**: o campo "Nova senha" some para contas vinculadas ao Jira; a
   senha do Jira indica que é atualizada a cada login.
7. README da raiz (primeiros passos) e `CLAUDE.md` do backend atualizados.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/src/domain/jiraLogin.ts` | novo — regras puras do login (rota, usuário, classificação de falha) |
| `smart-ai-flow/src/infra/jiraService.ts` | `verifyJiraLogin` |
| `smart-ai-flow/src/infra/userRepository.ts` | `findLoginCandidate`, `upsertJiraLogin`, `isJiraLinked` |
| `smart-ai-flow/src/infra/settingsRepository.ts` | `DEFAULT_JIRA_BASE_URL`, URL nunca vazia |
| `smart-ai-flow/src/http/routes.ts` | login pelo Jira, fim do bootstrap, recuperação recusa conta do Jira |
| `smart-ai-flow/tests/jiraLogin.test.ts` | novo — 10 testes |
| `web/app/login/page.tsx` | login com credencial do Jira |
| `web/app/settings/account/page.tsx` | sem senha local para conta do Jira |
| `web/app/settings/jira/page.tsx` | placeholder e dica com a URL padrão |
| `web/lib/api.ts` | `authStatus` novo formato, `bootstrapAdmin` removido, `jiraBaseUrl` não nulo |
| `README.md`, `smart-ai-flow/CLAUDE.md` | documentação |

## Decisões
- **Conta vinculada ao Jira não aceita senha local.** A tela pública de "esqueci
  minha senha" troca a senha de qualquer conta sem provar nada; se a senha local
  continuasse valendo, ela seria porta de entrada para a conta de quem usa o
  Jira. Por isso a recuperação também recusa essas contas (409).
- **Contas antigas sem Jira continuam entrando** (ex.: o admin do bootstrap):
  para elas a senha local é conferida **antes**, sem gastar tentativa no Jira —
  cada senha errada lá aproxima o CAPTCHA. Se a senha local não bater, tenta o
  Jira e a conta é vinculada.
- **Vínculo de contas existentes**: o login casa pelo usuário da plataforma ou
  pelo usuário do Jira já gravado (sem diferenciar caixa). Conta local com o
  mesmo nome do usuário do Jira e sem vínculo é tratada como a mesma pessoa. Se
  esse nome já está vinculado a **outra** conta do Jira, o login é recusado com
  mensagem para um admin resolver — vincular entregaria a conta de alguém.
- **Nome de usuário novo em minúsculas** (`name` do Jira): o Jira não diferencia
  caixa no login e o `username` local é único com caixa.
- **Jira fora do ar = ninguém novo entra.** Não há fallback para senha local de
  conta vinculada, pelo motivo do primeiro item. Contas antigas sem vínculo
  seguem entrando.
- **Sem migração**: nenhum campo novo; a URL padrão é aplicada na leitura.
- Cadastro de usuário por admin (Configurações → Usuários) continua existindo,
  mas deixou de ser necessário.

## Verificação
- Backend: `npm test` 235 verdes (10 novos) e `typecheck` limpo. Numa das
  execuções um teste já existente falhou uma vez e não reproduziu em duas
  reexecuções seguidas — aparenta ser timeout sob carga, não ligado à mudança.
- Web: `tsc --noEmit` e `eslint` limpos.
- **Não testado contra o `portalcliente.pixeon.com` real** nem no navegador.

## Pendências
- Rodar um login real (conta nova e conta já existente) depois de
  `docker compose up -d --build backend web`.
- Quem tinha conta antiga com usuário da plataforma diferente do Jira e sem Jira
  configurado: ao entrar pelo Jira ganha uma **conta nova** (os cards antigos
  ficam na conta velha). Um admin pode preencher o usuário do Jira na conta
  antiga antes, para que o login caia nela.
- A tela `/recuperar-senha` continua existindo para contas antigas sem Jira;
  pode ser removida quando todos estiverem vinculados.
