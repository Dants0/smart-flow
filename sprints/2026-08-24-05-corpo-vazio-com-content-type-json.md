# Corpo vazio com content-type JSON quebrava toda rota sem corpo

- **Data:** 2026-08-24
- **Solicitação:** dev clicou em "Testar conexão" do Bitbucket e recebeu `FST_ERR_CTP_EMPTY_JSON_BODY`
- **Status:** concluído — pendente de rebuild dos containers

## O bug

```json
{ "statusCode": 400, "code": "FST_ERR_CTP_EMPTY_JSON_BODY",
  "message": "Body cannot be empty when content-type is set to 'application/json'" }
```

O `request()` do front (`web/lib/api.ts`) mandava `content-type: application/json`
em **toda** chamada, com ou sem corpo. O parser default do Fastify recusa corpo
vazio quando o header anuncia JSON. Resultado: **toda rota sem corpo estava
quebrada no navegador**, não só o botão que o dev clicou:

| Rota | Onde aparece |
|---|---|
| `POST /me/bitbucket/test` | Testar conexão do Bitbucket |
| `POST /me/jira/test` | Testar conexão do Jira |
| `POST /me/jira/unblock` | "Destravei o CAPTCHA, pode voltar a consultar" |
| `POST /jira/pending/:key/dismiss` | Dispensar chamado do banner |
| `DELETE /users/:id` | Apagar usuário |

**Por que nenhum teste pegou:** `app.inject()` não manda content-type sozinho.
A suíte passava com o app real quebrado. É a mesma classe de falha já
documentada no pb-insight (docs/14 de lá) — e ela reapareceu aqui porque a
lição tinha ficado só naquele projeto.

## O que foi feito

1. **`web/lib/api.ts`** — só declara `content-type: application/json` quando
   existe corpo. Corrige a causa, e de uma vez para as cinco rotas.
2. **`src/http/jsonBodyParser.ts`** — parser tolerante: corpo vazio ou só
   espaço vira `{}`; JSON malformado continua 400 (via `InvalidJsonBodyError`
   com `statusCode`). Defesa para qualquer outro cliente — curl, Swagger, um
   segundo front.
3. **`src/server.ts`** — registra o parser antes das rotas.
4. **6 testes** em `tests/jsonBodyParser.test.ts` (126 no total, era 120),
   incluindo requisições com o header **explícito** — sem isso o teste não
   reproduz o bug.

**Verificado que o teste pega o bug:** subindo um Fastify sem o parser custom,
o mesmo request responde `400 FST_ERR_CTP_EMPTY_JSON_BODY`. Com o parser, 200.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `web/lib/api.ts` | header JSON só quando há corpo |
| `src/http/jsonBodyParser.ts` | novo — parser tolerante a corpo vazio |
| `src/server.ts` | registra o parser |
| `tests/jsonBodyParser.test.ts` | novo — 6 testes |
| `CLAUDE.md` | estrutura + contagem de testes |

## Decisões

- **Corrigido nas duas pontas.** O front é a causa; o parser é a rede. Só o
  front deixaria a API frágil para qualquer outro cliente; só o parser deixaria
  o front mentindo sobre o que envia.
- **Parser extraído para `http/`, não inline no `server.ts`.** É regra que
  decide, e o `CLAUDE.md` exige teste — em módulo próprio ela é testável sem
  subir o app inteiro com JWT e banco.
- **JSON malformado continua 400.** Aceitar corpo vazio não podia virar
  desculpa para engolir corpo quebrado.
- **O teste manda o content-type explicitamente.** É o detalhe que separa um
  teste que documenta o bug de um que repete o engano da suíte anterior.

## Pendências

- **Rebuild dos containers** (`docker compose up -d --build backend web`) —
  vale para esta correção e para a das duas identidades do Bitbucket (sprint 04).
- Continuam abertas: correção nos 6 `.srw` do `mwsus` (SMART-50927) e rebuild do
  pb-insight para o endpoint `/siblings`.
