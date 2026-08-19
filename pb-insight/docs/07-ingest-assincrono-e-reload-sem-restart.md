# 07 — Reingestão assíncrona via API + reload sem reiniciar o servidor

> Entregue em 2026-07-24. Responde diretamente à pergunta "quando eu resolver
> um chamado e der pull, como a aplicação se comporta?" — antes, o servidor
> HTTP não tinha nenhum jeito de perceber uma reingestão sem ser reiniciado
> manualmente. Também abstrai o último comando `npm` que ainda não tinha
> equivalente na API (`npm run ingest`), a pedido do usuário: "vamos abstrair
> ao máximo os comandos npm para o frontend".

## O problema que isso resolve

Antes desta entrega, o comportamento era:

1. CLI (`search`, `context`, `diagnose`, etc.) recarrega `.data/graph.json` do
   zero a cada execução — sempre atualizado depois de um `npm run ingest`.
2. **O servidor HTTP carregava o grafo uma única vez, na subida, e nunca
   mais.** Reingerir enquanto o servidor já estava rodando não tinha efeito
   nenhum sobre as respostas — era preciso reiniciar o processo manualmente.

Isso significava: `git pull` → `npm run ingest` → **reiniciar `npm run
serve` manualmente** para o frontend (futuro) ver os dados novos. Um passo
manual a mais que o pedido do usuário explicitamente queria eliminar.

## O que existe agora

Três peças novas, compostas:

```
POST /ingest          — reingesta o ws_objects do zero (~40-50s), em processo separado
GET  /ingest/status    — acompanha o progresso (running | done | error)
POST /reload           — recarrega só o graph.json em memória (rápido, segundos)
```

`POST /ingest`, ao terminar com sucesso, **chama `reloadContext` sozinho** —
o frontend nunca precisa encadear ingest→reload manualmente nem reiniciar
nada. `POST /reload` continua existindo à parte para o caso de alguém rodar
`npm run ingest` direto no terminal (ou outro processo já ter atualizado o
`graph.json`) e só querer que o servidor já rodando sirva os dados novos.

### Por que processo separado, não thread/promise no mesmo processo

Ingestão é ~40-50s de `readdirSync`/`readFileSync`/regex síncronos sobre
289MB — rodar isso na thread principal do Node bloquearia **todas as outras
requisições** pelo mesmo tempo (não é I/O assíncrono, é CPU-bound síncrono).
`IngestJobManager` resolve isso rodando o mesmo `ingest.command.ts` já
testado como processo filho (`child_process.spawn`) — o event loop do
servidor fica livre o tempo todo. Validado na prática: enquanto a ingestão
rodava, `GET /health` respondeu normalmente.

Comunicação de resultado é via um arquivo JSON (`--report`, novo flag do
`ingest.command.ts`), não parsing de stdout — mais robusto.

```
src/infrastructure/ingest/ingest-job-manager.ts   IngestJobManager (spawn injetável — testável sem processo real)
src/interfaces/http/reload-context.ts             reloadContext() — muta o AppContext em memória
src/interfaces/http/routes/ingest.route.ts         as 3 rotas acima
```

### Estado mutável do AppContext

`AppContext.repository`/`.searchIndex`/`.graphPath` deixaram de ser
implicitamente fixos — `reloadContext()` os reatribui **no mesmo objeto**
que todas as rotas já seguram por referência. Como cada handler lê
`ctx.repository`/`ctx.searchIndex` no corpo da função (não no registro da
rota), a próxima requisição já enxerga os dados novos automaticamente — sem
precisar reestruturar nenhuma rota existente.

## Validação real (não só testes com fake)

Rodei o ciclo completo contra o `ws_objects` de verdade:

1. Servidor subiu com o grafo antigo (`objectCount: 15928`, versão de uma
   ingestão anterior).
2. `POST /ingest` → `202 {"status":"running"}` — confirmei que `GET /health`
   respondia normalmente **durante** os 55s de processamento (event loop
   livre).
3. `GET /ingest/status` reportou `"done"` após ~56s com o relatório completo.
4. `GET /health` **imediatamente depois, sem reiniciar nada**, já mostrava a
   nova `version.label`/`id` — e `GET /search` continuou funcionando contra
   os dados recarregados.

### Bug real encontrado e corrigido durante essa validação

A primeira tentativa **falhou** com `ENOENT: no such file or directory,
scandir 'C:\controle'` — o `spawn(..., {shell: true})` no Windows não cita
automaticamente argumentos com espaço, e `C:\controle de versão\smart_desktop\ws_objects`
quebrou em pedaços separados no `cmd.exe`. Isso nunca tinha aparecido antes
porque o CLI sempre leu esse caminho direto de uma constante TypeScript
(`DEFAULT_WS_OBJECTS_ROOT`), nunca atravessando uma linha de comando de shell
— `IngestJobManager` foi o primeiro código a fazer isso. Corrigido citando
manualmente (`"..."`) qualquer argumento com espaço antes de montar o
`args[]` do `spawn`, com teste dedicado (`tests/infrastructure/ingest-job-manager.test.ts`)
travando esse comportamento.

## Fluxo recomendado, hoje

```
1. git checkout main && git pull   (você, fora do pb-insight — nunca automatizado aqui)
2. POST /ingest                     (ou npm run ingest, se preferir terminal)
3. GET /ingest/status até "done"    (o servidor já se atualiza sozinho quando terminar)
```

Nenhum passo de "reiniciar o servidor" nem "chamar reload depois do ingest"
— um frontend futuro pode expor isso como um único botão "Atualizar" com uma
barra de progresso poll-based.

## Decisões registradas

1. **Processo filho reaproveitando o CLI já testado, não uma reimplementação
   paralela da lógica de ingestão.** `IngestJobManager` não duplica
   `IngestCodebaseVersionUseCase` — ele roda `tsx
   src/interfaces/cli/ingest.command.ts` exatamente como o usuário rodaria
   manualmente, garantindo que o comportamento validado (docs/01, docs/02)
   é idêntico ao usado pela API.
2. **`spawnFn` injetável no construtor de `IngestJobManager`** — mesmo
   padrão de portas/adapters do resto do projeto, permite testar o ciclo de
   vida do processo (sucesso, erro, concorrência, citação de argumentos) sem
   rodar um processo real de 40-50s nos testes.
3. **`POST /ingest` sem schema de corpo estrito** — um `POST` sem
   `content-type`/corpo é uso legítimo aqui (label é opcional), e a validação
   AJV do Fastify rejeita `undefined` contra qualquer `type: "object"` mesmo
   com todas as propriedades opcionais. Documentado no código para não ser
   "corrigido" de volta por engano no futuro.
4. **Um job por vez** — `start()` retorna `null` (→ 409) se já há uma
   ingestão em andamento. Rodar duas ingestões simultâneas não tem benefício
   (mesma fonte, mesmo destino) e só desperdiçaria CPU/IO.
5. **Comunicação via arquivo JSON (`--report`), não parsing de stdout** —
   stdout é para humanos lerem no terminal; o relatório estruturado é a
   fonte de verdade para o processo pai decidir o que aconteceu.

## Limitações conhecidas

- Estado do job (`IngestJobManager`) é só em memória — se o servidor cair
  no meio de uma ingestão, o status "running" se perde (mas o processo filho
  spawnado também morre junto, então não fica órfão rodando sozinho).
- Sem cancelamento de ingestão em andamento — se disparar por engano, só dá
  pra esperar terminar ou matar o processo manualmente.
- `POST /ingest` usa `ctx.wsObjectsRoot` fixo (configurado na subida do
  servidor via `PB_INSIGHT_WS_ROOT`) — não aceita uma raiz alternativa por
  requisição. Não pareceu necessário: a raiz do `ws_objects` não muda entre
  chamadas de um mesmo servidor.

## Próximos passos

- Frontend: um botão "Atualizar" fazendo `POST /ingest` + poll de
  `GET /ingest/status` é agora só um pequeno componente de UI, não mais uma
  peça de infraestrutura faltando.
- Ainda pendente desde docs/03: rodar 2-3 chamados reais diferentes antes de
  qualquer conclusão mais ampla sobre a hipótese de granularidade de evento.
