# 10 — Evidência visual no diagnóstico + frontend da base de tickets

## Pedido do usuário

1. Anexar imagem (screenshot) como evidência na tela de diagnóstico.
2. Popular a base de tickets diretamente pelo frontend, incluindo "quais
   objetos (windows, etc.) foram mexidos" em cada ticket — ou seja, uma UI
   para `ticket_object_links` (§13.6, docs/09).

## 1. Evidência visual em `POST /diagnose`

Claude (Sonnet 5) e GPT-4o-mini suportam entrada de imagem nativamente — a
mudança foi propagar isso pela pilha inteira em vez de só no adapter:

- `DiagnosticContext.images?: DiagnosticImage[]` (`src/application/ports/llm-client.port.ts`) —
  `{ mediaType, base64Data }`, `mediaType` restrito a
  `image/png | image/jpeg | image/gif | image/webp` (mesmo conjunto aceito
  pelas duas APIs — ver `src/domain/value-objects/image-media-type.ts`).
- `ClaudeDiagnosticClient`/`OpenAIDiagnosticClient`: a mensagem enviada passa
  a ser um array de content blocks (imagens primeiro, texto do prompt por
  último), no formato nativo de cada SDK (`ImageBlockParam`/
  `ChatCompletionContentPartImage`).
- `buildDiagnosisPrompt`: quando há imagens, acrescenta uma nota avisando o
  modelo para considerá-las como evidência.
- `DiagnoseTicketUseCase.diagnose(preparation, ticketText, images?)`.
- `POST /diagnose` aceita `images` no body (base64 puro, sem prefixo
  `data:`); valida `mediaType` no handler (não no schema — assim a mensagem
  de erro é descritiva: `mediaType "X" inválido. Use um de: ...`, em vez do
  formato genérico do AJV). `dryRun` reporta `imageCount` sem custo.
- Fastify `bodyLimit` subido para 20 MiB (default é 1 MiB — screenshots em
  base64 estouram isso fácil).
- CLI: `npm run diagnose -- ... --images screenshot1.png,screenshot2.jpg`
  (lê o arquivo, detecta o mediaType pela extensão, converte para base64).
- Frontend (`DiagnosePanel.tsx`): `<input type="file" multiple>` restrito aos
  4 formatos aceitos; conversão via `FileReader.readAsDataURL` + strip do
  prefixo; chips removíveis com o nome de cada arquivo anexado; contagem de
  imagens aparece no resultado (dry-run e real).

**Custo**: imagens contam como tokens de entrada nas duas APIs — o texto do
schema HTTP e o CLI avisam isso explicitamente, seguindo o mesmo princípio
de transparência de custo já estabelecido no projeto (ver
docs/06-multi-provider-llm-e-controle-de-custo.md).

**Não persistido**: como o motor de diagnóstico já não salva sessões (não
existe `DiagnosticSession` implementado — SPEC §3 menciona, mas nunca foi
construído), as imagens são usadas só na chamada corrente e descartadas —
consistente com o resto do fluxo de diagnóstico, que também é stateless.

## 2. Frontend da base de tickets (`TicketsPanel.tsx`)

Nova aba "Tickets" no frontend, cobrindo o ciclo completo sem precisar do
CLI:

- **Cadastrar ticket**: formulário (externalId, título, módulo, versão
  afetada, descrição, resolução) → `POST /tickets`.
- **Lista de tickets cadastrados**, clicável.
- **Ticket selecionado**: mostra a resolução registrada + os objetos já
  ligados a ele (`GET /tickets/:id` → `links`) — responde diretamente à
  pergunta "quais objetos foram mexidos no ticket-XXXXX".
- **Adicionar link**: formulário (nome do objeto, evento/controle dono
  opcionais, notas) → `POST /tickets/:id/links`; mostra aviso quando o nome
  do objeto é ambíguo entre PBLs (mesmo campo `ambiguities` já usado em
  outros lugares da API).
- **Busca por similaridade**: campo de texto → `GET /tickets/similar`,
  resultado mostra score + os objetos já linkados a cada ticket semelhante.

## Testes e validação

- Backend: +5 testes (109 no total) — `diagnosis-prompt.test.ts` (nota de
  evidência visual), `diagnose-ticket.test.ts` (repasse de `images` ao
  `ILLMClient`), `server.test.ts` (imagem válida repassada + `imageCount`,
  mediaType inválido → 400).
- Frontend: `tsc -b --noEmit` e `oxlint` limpos.
- Validação manual ao vivo (backend restartado, frontend no Vite dev
  server): cadastrei um ticket de teste pela UI, linkei a
  `w_definir_periodo` (objeto real do grafo), busquei por similaridade e
  confirmei que o resultado trouxe o link certo com score correto — depois
  limpei o `.data/tickets.json` de novo para não poluir a base real.

## Próximos passos (não feitos aqui)

- Testar o upload de arquivo de imagem de ponta a ponta via automação de
  browser (só o código + tipos foram validados; a interação de
  seleção de arquivo em si não foi exercitada por automação).
- Wiring de tickets semelhantes dentro do `DiagnoseTicketUseCase` (§13.7,
  pendência já registrada em docs/09).
