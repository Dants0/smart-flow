# A conta corporativa não emite mais chave: token OAuth na Anthropic

- **Data:** 2026-08-28
- **Solicitação:** "sobre o ANTHROPIC API KEY, a minha corporativa agora usa o outro aí precisa CLAUDE_CODE_OAUTH_TOKEN, como ajustar para aceitar os dois cenários??" + "ao terminar pode tirar a variavel setada no compose"
- **Status:** concluído

## O que foi feito

As duas credenciais da Anthropic não são intercambiáveis: a chave de API viaja
em `x-api-key`, e o token OAuth (o mesmo `CLAUDE_CODE_OAUTH_TOKEN` do Claude
Code, que é o que a conta corporativa emite) viaja em `Authorization: Bearer`
**mais** o header `anthropic-beta: oauth-2025-04-20`, sem o qual o
`/v1/messages` recusa. Trocar os headers dá 401 sem dizer qual dos dois caminhos
foi tomado — daí o desenho abaixo insistir em deixar o tipo explícito e visível.

**Uma credencial guardada, com tipo.** `PlatformSettings.anthropicApiKey` virou
`anthropicCredential`, e ganhou `anthropicAuthType` (`apiKey` | `oauth`). O
RENAME preserva o que já estava gravado — tudo que existia era chave de API, que
é o default do tipo. Trocar o tipo pela tela **apaga a credencial guardada**: a
antiga não serve para o outro header, e manter um segredo inútil no banco só
cria a chance de ele voltar sem querer. A tela avisa disso antes de salvar,
enquanto ainda dá pra colar a nova ou desfazer.

**O campo não usado vai como `null` explícito** (`anthropicClientOptions`, em
`llm.ts`). Essa é a linha que mais importa do trabalho todo: omitindo `apiKey`,
o SDK cai em `process.env.ANTHROPIC_API_KEY`, e a chave de API **vence** o token
na montagem do header. Uma variável esquecida no ambiente do container
sequestraria em silêncio a credencial escolhida na tela.

**A variável saiu do compose**, a pedido: `ANTHROPIC_API_KEY` era passada ao
`trace-api` e ninguém a lia por lá — o backend manda a credencial na própria
requisição. Com o token OAuth em uso, ela deixou de ser inofensiva e passou a
ser exatamente o tipo de sombra descrito no parágrafo acima.

**O app_trace acompanha.** Ele fala com a Anthropic por conta própria e só sabia
mandar `x-api-key`; com token OAuth a análise de trace falharia sozinha, num
ponto distante da tela onde a credencial foi configurada. Passou a receber
`key_anthropic_oauth` e a montar Bearer + beta quando é esse o caso.

**O monitor diz qual credencial está em uso** (`ATIVO · modelo X · token OAuth`).
Como os dois erram com o mesmo 401, sem essa palavra o dev não tem como saber
por qual caminho a requisição saiu.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/prisma/schema.prisma` | `anthropicApiKey` → `anthropicCredential`; novo `anthropicAuthType` |
| `smart-ai-flow/prisma/migrations/20260828120000_credencial_anthropic_oauth/` | RENAME preservando o valor gravado + coluna do tipo com default `apiKey` |
| `smart-ai-flow/src/infra/llm.ts` | `anthropicClientOptions` (pura, exportada) e mensagem de credencial faltando por tipo |
| `smart-ai-flow/src/infra/settingsRepository.ts` | `AnthropicAuthType`, campos novos, e a regra "trocar o tipo apaga a credencial" |
| `smart-ai-flow/src/infra/traceService.ts` | manda `key_anthropic` ou `key_anthropic_oauth` conforme o tipo |
| `smart-ai-flow/src/infra/monitor.ts` | detalhe do recurso diz qual credencial está ativa |
| `smart-ai-flow/src/http/{routes,schemas}.ts` | `anthropicCredentialSet` + `anthropicAuthType` na API |
| `smart-ai-flow/tests/anthropicAuth.test.ts` | novo — header por tipo, o beta do OAuth, e o `null` explícito |
| `web/lib/api.ts`, `web/app/settings/ai/page.tsx` | seletor "Como autenticar", campo único, aviso de troca destrutiva |
| `app_trace/{main.go,internal/models/log_event.go,internal/ai/service-ai.go}` | campo novo no form e Bearer + beta quando for token |
| `docker-compose.yml` | `ANTHROPIC_API_KEY` removida do `trace-api` |
| `smart-ai-flow/{CLAUDE.md,README.md}`, `app_trace/README.md` | briefing e instruções alinhados |

## Decisões

- **Uma credencial só no banco, não duas.** Foi escolha do solicitante entre as
  opções apresentadas. Custa recolar o segredo se voltar atrás, e em troca não
  existe segredo órfão guardado nem dúvida sobre qual está valendo.
- **Sem fallback de ambiente.** Também escolha do solicitante: a credencial vem
  da tela, ponto. Mantém a regra que o projeto já segue (o `.env` é só bootstrap)
  e é o que torna a remoção da variável do compose segura.
- **`anthropicClientOptions` é função pura e exportada**, como `classifyDenial` e
  `jqlFoiRecusada`: é regra que decide, e regra que decide tem teste sem rede.
- **O tipo é explícito, não adivinhado pelo prefixo do segredo.** Roteamento por
  prefixo (`sk-ant-oat…`) depende de um formato que a Anthropic não promete, e o
  modo de falha seria um 401 mudo.

## Pendências

- **A credencial continua em texto puro no banco**, como já era a chave de API.
  Jira e Bitbucket vão cifrados (`infra/crypto.ts`); esta não. Não é regressão
  desta sprint, mas fica anotado — a coluna agora guarda também token OAuth.
- **O token OAuth não foi exercitado contra a API de verdade** aqui: não há
  credencial corporativa nesta máquina. O caminho está montado conforme a
  documentação (Bearer + beta `oauth-2025-04-20`); a primeira análise depois de
  configurar é o teste real.
- Reconstruir os containers: `docker compose up -d --build backend web trace-api`
  (o `backend` aplica a migração ao subir).
