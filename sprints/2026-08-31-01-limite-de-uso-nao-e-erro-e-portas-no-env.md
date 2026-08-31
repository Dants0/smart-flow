# O 429 que virava ERRO, e as portas fora do .env

- **Data:** 2026-08-31
- **Solicitação:** "tentei rodar a análise de um chamado e 429 ... ajuste o que for necessário" + "as portas que a aplicação irá rodar você coloca nos respectivos .env de cada pasta porque daí fica mais fácil para quando outro dev for ajustar e conseguir rodar na porta que quiser a aplicação"
- **Status:** concluído

## O contexto

O token OAuth foi configurado e salvo pela tela (Configurações → IA), e o teste
rodou em cima dele. O que voltou foi:

```
ANALISE → ERRO · 429 {"type":"error","error":{"type":"rate_limit_error",
"message":"Error"},"request_id":"req_011Ceb1FoKjF6dSiMSQkJPzw"}
```

O 429 mostra que a autenticação passou — credencial errada dá 401.

> **A hipótese inicial estava errada, e o adendo no fim deste registro conta o
> porquê.** Trabalhou-se assumindo limite de uso da assinatura; o `/usage` da
> conta e uma chamada crua depois mostraram que era recusa de permissão. A
> correção construída sobre essa hipótese continua valendo — 429 de cota
> existe e é tratado —, mas não era o que estava acontecendo aqui.

E a esteira tratava rotina como incidente: `orchestrator.ts` mandava **toda**
exceção pra ERRO. Um limite que reabre em minutos parava o card e exigia um
clique humano no reprocessar — o oposto do que a esteira existe pra fazer.
Pior: a mensagem guardada era o corpo cru (`"message":"Error"`, literalmente
sem detalhe), porque os headers `anthropic-ratelimit-*`, que dizem qual balde
estourou e quando reabre, eram descartados em `llm.ts`.

A fila até tinha retentativa (`MAX_ATTEMPTS = 3`), mas ela nunca era exercida
para falha de LLM: o orquestrador engolia a exceção antes de chegar ao worker.

## O que foi feito

### 1. Falha transitória virou um tipo

`infra/llmErrors.ts` (novo) separa o que passa sozinho do que não passa:

- **transitório** — 408, 409, 429, 5xx, 529 (`overloaded` da Anthropic) e falha
  de conexão (sem status). Vira `TransientLlmError`.
- **definitivo** — 400 (`credit balance is too low`), 401, 403 e qualquer coisa
  fora da lista. Continua indo pra ERRO na hora, como antes.

O 400 de saldo ficou explicitamente de fora, com teste: retentá-lo seria queimar
a fila esperando um crédito que só entra por ação humana (ver
[2026-08-26-01](2026-08-26-01-chamado-sumido-do-aviso-e-saldo-da-api.md)).

Junto vieram os headers de cota, que agora são preservados na mensagem de
auditoria e usados para calcular a espera: `retry-after` primeiro; na falta
dele, o **maior** dos `*-reset` (esperar o balde que reabre primeiro só
produziria outro 429). Aceita as duas formas que a API usa — RFC3339 nos baldes
por chave de API e epoch em segundos no balde unificado do token OAuth.

### 2. O orquestrador propaga em vez de sepultar

`advance()` continua gravando a linha em `Run` (a auditoria da chamada perdida
não se perde), mas relança `TransientLlmError` em vez de mover o card pra ERRO.
Quem decide o que fazer com isso passou a ser a fila.

### 3. A fila aprendeu a esperar

`Job` ganhou dois campos (migração `20260831120000_job_espera_por_limite_de_uso`):

- `availableAt` — antes disso o worker nem olha o job. Ele segue PENDING, então
  a fila não o perde de vista, mas some do `claimNextJob` até a hora marcada.
- `deferrals` — contador de esperas, **separado** de `attempts`.

A separação dos dois orçamentos é o coração da correção. `attempts` é orçamento
para falha real (3 e o card vai pra ERRO); esperar cota não é tentativa gasta.
Se contassem juntos, três 429 seguidos — uma tarde comum — mandariam pra ERRO um
card que só precisava de dez minutos. Por isso `adiarPorCota` devolve o
`attempts` que o claim havia incrementado.

Espera: o que o provedor pediu, limitada a **1 min no piso** (repicar a cada 2s
só gera outro 429) e **15 min no teto** (card preso 3h sem sinal de vida é
indistinguível de card travado). Sem sugestão do provedor, backoff dobrando a
partir de 1 min. Teto de 20 esperas — aí sim vira ERRO, porque não é mais janela
de cota.

### 4. O dev consegue ver a espera

- `domain/card.ts` ganhou `noteOnCard`: registra no histórico **sem** trocar de
  estágio. `ANALISE → ANALISE` não é transição válida e não deve virar uma —
  declará-la no `TRANSITIONS` abriria caminho para laço de estágio.
- A nota é **atualizada** a cada espera (`noteOnCard` substitui a linha anterior
  de mesmo prefixo). A primeira versão gravava uma vez só e a linha envelhecia:
  cinquenta minutos depois o card ainda anunciava "nova tentativa em 1 min", o
  que fazia a espera parecer travamento — o mal-entendido que a nota vinha
  justamente evitar. Vinte linhas iguais também não servem, daí substituir.
- `CardEvidence.tsx` renderiza `from === to` como um estágio só, sem a seta.
- O monitor ganhou o contador **Aguardando cota**, e "Na fila" passou a excluir
  quem está esperando — senão o número diria que há trabalho parado quando há
  trabalho agendado.

### 5. maxRetries do SDK

De 2 (default) para 3, e o comentário registra o limite disso: o SDK ignora
`retry-after` maior que 60s, então ele cobre soluço de segundos e nada mais. A
janela da assinatura é problema da fila.

### 6. Portas nos .env de cada pasta

O pedido esbarra numa restrição do Docker Compose que vale registrar: **ele não
lê os `.env` das subpastas** para montar `ports:` — a interpolação só enxerga o
`.env` da raiz e o ambiente do shell. Então os dois lugares existem, com papéis
diferentes e documentados em cada arquivo:

| Onde | Vale para |
|---|---|
| `.env` da raiz, seção **Portas** | a stack Docker (`BACKEND_PORT`, `WEB_PORT`, `TRACE_PORT`, `PB_INSIGHT_PORT`, `DB_PORT`) |
| `PORT` no `.env` de cada pasta | o serviço rodando direto (`npm run dev`, `go run .`) |

No compose, cada variável vale ao mesmo tempo para o processo dentro do
container e para a porta publicada no host — é uma linha por serviço, e não
sobra mapeamento apontando para o vazio. As URLs internas
(`TRACE_SERVICE_URL`, `PB_INSIGHT_URL`) passaram a derivar das mesmas variáveis.

`NEXT_PUBLIC_API_URL` foi **comentado** no `.env` da raiz: assim o compose o
deriva de `BACKEND_PORT` sozinho, e trocar a porta do backend continua sendo uma
linha só. Descomentar segue sendo o caminho para acessar de outra máquina.

Faltavam arquivos: `web/` não tinha `.env.example` (e o `.gitignore` dele ignora
`.env*` inteiro, então precisou de `!.env.example`) nem `PORT`; `pb-insight/`
não tinha exemplo nenhum, e o `.dockerignore` liberava `!.example.env`, arquivo
que não existe ali.

Por fim, `app_trace` exigia a porta na forma `:8070` — o gin quer o dois-pontos,
e quem esquece não recebe erro: cai no default `:8080` e o serviço aparece
OFFLINE no monitor sem nenhuma pista. Como trocar a porta é exatamente o que
outro dev vai querer fazer, `listenAddr` passou a aceitar `8070`, `:8070` ou
vazio.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/src/infra/llmErrors.ts` | **novo** — classificação transitório/definitivo, headers de cota, espera sugerida, `ehRecusaDisfarcadaDe429` |
| `smart-ai-flow/src/infra/llm.ts` | `maxRetries: 3`; erro do SDK e do fetch da OpenAI viram `TransientLlmError` |
| `smart-ai-flow/src/orchestrator/orchestrator.ts` | relança falha transitória em vez de mover pra ERRO (a linha em `Run` continua) |
| `smart-ai-flow/src/infra/jobQueue.ts` | `claimNextJob` respeita `availableAt`; `adiarPorCota`; orçamento de esperas separado; `waiting` em `queueStats` |
| `smart-ai-flow/src/domain/card.ts` | `noteOnCard` — histórico sem troca de estágio, com substituição de nota recorrente |
| `smart-ai-flow/prisma/schema.prisma` + migração | `Job.availableAt`, `Job.deferrals`, índice do claim |
| `smart-ai-flow/tests/llmErrors.test.ts` | **novo** — 19 casos de classificação, parsing de header e backoff |
| `smart-ai-flow/tests/orchestratorFalhaTransitoria.test.ts` | **novo** — 429 propaga, falha definitiva ainda vai pra ERRO |
| `smart-ai-flow/tests/card.test.ts`, `tests/anthropicAuth.test.ts` | `noteOnCard`; `maxRetries` |
| `web/lib/api.ts`, `web/app/settings/resources/page.tsx` | contador "Aguardando cota" |
| `web/components/card/CardEvidence.tsx` | anotação sem seta quando `from === to` |
| `docker-compose.yml` | portas e URLs internas vindas das variáveis; Postgres publicado no host |
| `.env`, `.env.example` | seção **Portas**; `NEXT_PUBLIC_API_URL` comentado |
| `smart-ai-flow/.env` e `.env.example`, `web/.env.example`, `web/.env.local`, `web/.gitignore`, `app_trace/.env`, `app_trace/.example.env`, `pb-insight/.env`, `pb-insight/.env.example`, `pb-insight/.dockerignore` | `PORT` documentado por pasta |
| `app_trace/main.go` | `listenAddr` aceita `8070`, `:8070` ou vazio |
| `README.md`, `smart-ai-flow/CLAUDE.md` | seção "Quando a IA bate o limite de uso"; como trocar portas |

## Decisões

- **Esperar não gasta tentativa.** Foi a decisão central. Misturar os dois
  contadores faria a correção não corrigir nada: bastariam três 429 para o card
  cair em ERRO do mesmo jeito.
- **Teto de 15 min por espera, mesmo com `retry-after` maior.** Prefere-se um
  429 a mais a um card sem sinal de vida por horas. O `deferrals` cobre a janela
  longa somando esperas curtas.
- **Anotar só na primeira espera.** Explicação que se repete vinte vezes deixa
  de ser explicação.
- **`ANALISE → ANALISE` não virou transição válida.** Anotar é outra operação,
  não um movimento; declarar a transição abriria caminho para laço no
  orquestrador.
- **Dois lugares para a porta, documentados como tais.** Não é duplicação por
  descuido: é limitação do Compose, e cada arquivo diz qual manda em qual modo.

## Adendo: o 429 não era limite de uso

Depois de entregue o acima, o card reprocessado ficou 1h esperando, com 7 adiamentos
e nenhum sucesso. O `/usage` da conta corporativa (Pixeon, Claude Team) marcava
**0% de sessão e 0% de semana** — ou seja, nada estava sendo contabilizado.

Uma chamada direta ao `/v1/messages` com o token fechou o diagnóstico:

```
HTTP/1.1 429 Too Many Requests
anthropic-organization-id: 2d133862-...      <- o token autenticou
anthropic-workspace-id:    wrkspc_01PAdpy...
x-should-retry: true
(nenhum anthropic-ratelimit-*, nenhum retry-after)
```

Um 429 de cota real traz os baldes e o `retry-after`. Este não traz nada, e o
consumo não aparece no `/usage`: a chamada é **barrada antes de ser
contabilizada**. Não é limite — é recusa de permissão vestida de 429. O token
OAuth da conta Team autentica e resolve a organização, mas não tem direito de
chamar a API fora do Claude Code.

Isso invalidava a correção principal **para este caso**: a espera é a pior
resposta possível quando não há janela reabrindo. O card ia queimar 20
adiamentos (~3h) para cair em ERRO com a mesma mensagem vazia.

`ehRecusaDisfarcadaDe429` (`llmErrors.ts`) passou a separar os dois pelo único
sinal disponível — a presença dos headers de cota:

| 429 | Sinal | O que a esteira faz |
|---|---|---|
| cota de verdade | tem `anthropic-ratelimit-*` / `retry-after` | espera e retoma |
| recusa de permissão | não tem nenhum, mensagem esvaziada | ERRO na hora, dizendo o que trocar |

Se a heurística errar (429 de cota sem headers), o custo é o comportamento
antigo: card em ERRO e o dev clica reprocessar. Verificado em produção local: o
SMART-52020 foi para ERRO em 1 minuto com a mensagem acionável, em vez de esperar
três horas.

**Consequência prática: esta plataforma precisa de chave de API.** O seletor de
token OAuth continua na tela porque a restrição é da conta, não do código — se a
Pixeon liberar acesso à API para o token, ele passa a funcionar sem mexer aqui.

## Pendências

- **Migrar para chave de API continua sendo uma opção em aberto, não a
  recomendada agora.** Com crédito no console a cota é separada da assinatura e
  o 429 fica raro — mas foi justamente para evitar comprar crédito que o token
  OAuth entrou ([2026-08-28-02](2026-08-28-02-credencial-oauth-da-anthropic.md)).
  Se a espera passar a atrapalhar o dia a dia, é aí que a conversa muda.
- **A espera não aparece no card do board, só no painel aberto e no monitor.** O
  `previewOf` mostra causa raiz ou início do chamado; um selo "aguardando cota"
  na coluna exigiria expor o estado do job no `CardSummary`.
- **O `.env` da raiz e os das pastas podem divergir** se alguém trocar só um
  lado. Não há verificação — o `setup.ps1`/`setup.sh` poderia conferir.
- **A chave da OpenAI em `pb-insight/.env` apareceu em texto claro durante este
  atendimento** (ao editar o arquivo). Está fora do git, mas convém rotacioná-la
  no console da OpenAI.
- **O token OAuth foi colado no chat durante o atendimento** e deve ser
  considerado queimado — gerar outro com `claude setup-token` se for usado para
  qualquer coisa.
- **A esteira segue sem credencial Anthropic funcional.** Enquanto não houver
  chave de API com crédito, os cards vão para ERRO na primeira chamada. A
  alternativa imediata é o provider OpenAI, já configurado.
