# 14 — Fix: notas/evento não apareciam e DELETE não funcionava no browser

> Relatado em 2026-07-24: na aba Tickets, o usuário cadastrava objeto +
> evento + notas ao linkar um ticket, mas só via o objeto — evento e notas
> pareciam sumir. E não havia como apagar um ticket. Testado com dado real
> (`SMART-51431` → `d_lmc02tab`, já cadastrado por ele).

## Achado 1 — notas: não sumiam, só ficavam escondidas

`.data/tickets.json` já tinha o link com `notes: "lista lmc_periodo o Domingo
( 1 )"` salvo corretamente — o backend nunca perdeu o dado. O frontend
(`TicketsPanel.tsx`) só renderizava as notas via atributo HTML `title`
(tooltip ao passar o mouse), então na prática ficavam invisíveis. Trocado
para exibir a nota como texto normal abaixo do objeto/evento, num
`result-item` em vez de um `chip` compacto.

## Achado 2 — evento: dependia de dois campos preenchidos juntos, sem aviso

`submitLink()` só montava `{ owner, name }` quando **ambos** "Evento" e
"Controle dono" estavam preenchidos — se só um dos dois fosse preenchido, o
evento virava `undefined` e o link era criado só com o objeto, em silêncio
(sem erro, sem indício). A CLI (`ticket.command.ts`) já validava isso
explicitamente (`--event requer --owner`); o frontend nunca teve o
equivalente. Adicionada a mesma validação: se só um dos dois campos estiver
preenchido, mostra erro explicando o que falta em vez de descartar o evento
sem avisar.

## Achado 3 — DELETE não existia (ticket) E estava quebrado no browser (geral)

Não havia `DELETE /tickets/:id` em lugar nenhum — nem porta, nem repositório,
nem rota, nem UI. Adicionado de ponta a ponta:
- `ITicketRepository.deleteTicket(id)` — remove o ticket e, em cascata, seus
  `ticket_object_links` (`JsonTicketRepository`).
- `DELETE /tickets/:id` (aceita id interno ou `externalId`, mesmo padrão do
  `GET /tickets/:id`).
- Botão "Apagar" em cada linha da lista de tickets.

**Mas o primeiro teste manual no browser falhou mesmo com tudo isso
correto** — `TypeError: Failed to fetch`. Investigação revelou dois bugs de
infraestrutura pré-existentes, nenhum específico de tickets, que bloqueiam
**qualquer** `DELETE` da API quando chamado do navegador de verdade (o botão
"Apagar diagnóstico" do `DiagnosePanel`, que já existia, sofria do mesmo
problema sem que ninguém tivesse notado):

1. **CORS**: `app.register(cors, { origin: true })` em `build-server.ts`
   nunca setava `methods` — o default do `@fastify/cors` é literalmente
   `'GET,HEAD,POST'` (não é calculado a partir das rotas registradas). Todo
   preflight `OPTIONS` para `DELETE` respondia sem `DELETE` em
   `Access-Control-Allow-Methods`, e o browser bloqueava a requisição real
   antes dela sair. `curl`/`.inject()` não passam por preflight — por isso
   nenhum teste automatizado pegou isso. Corrigido: `methods: ["GET",
   "HEAD", "POST", "DELETE"]` explícito (únicos métodos realmente usados na
   API).
2. **Content-Type em corpo vazio**: `request()` em `frontend/src/api/client.ts`
   sempre mandava `Content-Type: application/json`, mesmo em chamadas sem
   body (todo `DELETE`). O parser JSON default do Fastify rejeita corpo
   vazio com esse header (`FST_ERR_CTP_EMPTY_JSON_BODY`, 400). Corrigido:
   só seta `Content-Type` quando `init.body` está presente.

## Por que os testes automatizados não pegaram nada disso

`app.inject()` (usado em `tests/http/server.test.ts`) não simula CORS nem
preflight — chama o handler Fastify diretamente. E os testes de
`DELETE /diagnoses/:id` nunca setavam `Content-Type` nas chamadas
`.inject()`, então também não batiam no bug do parser JSON. Os 131 testes
passavam o tempo todo com a API genuinamente quebrada no navegador — só
apareceu testando de verdade no Chrome (ver instrução do projeto: mudança de
UI exige teste real no browser antes de reportar como concluída).

## Decisão registrada

Não tentei generalizar `request()` para inferir `Content-Type` de forma mais
sofisticada (ex.: por método HTTP) — a regra "só quando há body" já cobre
todos os casos reais da API (GET/DELETE sem body, POST com body) e é fácil
de entender lendo o código.
