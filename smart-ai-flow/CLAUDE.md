# SMART AI Flow

Esteira de IA (estilo Kanban) para resolução assistida de chamados no
**SMART Desktop** (PowerBuilder/PFC) e seus módulos. Tira o fluxo do "chat no
terminal via console" e transforma em algo visual, centralizado e auditável —
com o **dev sempre no controle**.

O card escolhe o **sistema** — SMART Desktop ou SMART Web —, não o módulo: o
SMART Desktop acopla ATENDE, AGENDA, MWSUS e CADGF, e identificar qual deles é
o alvo faz parte da análise. Cada um tem seu briefing em
`modules/<modulo>/CLAUDE.md`, e os do SMART Desktop entram juntos no prompt
(ver `src/infra/moduleContext.ts`).

> Nome de trabalho: `smart-ai-flow`. Troque pelo nome que vocês quiserem
> deixar na fita. 😉

## O fluxo

```
NOVO            ANALISE          DESENVOLVIMENTO     REVISAO            RESOLVIDO
(dev cola   ->  (IA: causa   ->  (IA: diff        -> (dev aplica,   -> (dev confirma
 o chamado)      raiz +           proposto +          testa e            que o cenário
                 raciocínio)       justificativa)      ajusta)            não ocorre)
   dev             IA                 IA                 dev                dev
```

Só os estágios de **IA** rodam automáticos. Ao criar o card, o backend
dispara ANALISE → DESENVOLVIMENTO e **para em REVISAO**, esperando o dev.

## Arquitetura (decisão: "IA propõe, dev decide")

- O pipeline (ANALISE/DESENVOLVIMENTO) lê o código, nunca escreve. A escrita
  existe num único ponto: o dev clicar em "aplicar o diff" em REVISAO
  (`src/infra/workspace.ts`), com dry-run, backup e reversão.
- **O backend nunca toca no controle de versão** — não commita, não cria branch,
  não reverte. O que ele faz aparece como alteração local do dev.
- O **token corporativo vive só no backend** (`src/infra/llm.ts`, chave vinda de Configurações > IA).
  Nenhum dev bate na API pela própria máquina → custo e uso auditáveis.
- Contexto da IA = `CLAUDE.md` do sistema + RAG do **PB Insight** + a skill do
  time (Configurações > IA) + o chamado.
- Loop do RESOLVIDO fecha com **pbtrace** (antes/depois) como evidência.

## Estrutura

```
src/
  domain/        stages.ts (máquina de estados) + card.ts (entidade)
  agents/        contracts.ts (Zod) + analyzer.ts + proposer.ts
  orchestrator/  orchestrator.ts (segura o token, roda estágios de IA)
  infra/         llm.ts + pbInsight.ts (RAG) + moduleContext.ts + workspace.ts
  http/          routes.ts (Fastify)
modules/         um CLAUDE.md por módulo do SMART Desktop
  atende/  agenda/  smartweb/  mwsus/  cadgf/
prisma/          schema.prisma (Card, History, Run)
```

## Rodar

```bash
cp .env.example .env      # coloque o ANTHROPIC_API_KEY corporativo
docker compose up -d      # postgres
npm install
npm run db:push
npm run dev
```

```bash
# criar um card (dispara análise + proposta)
curl -X POST localhost:3333/cards -H 'content-type: application/json' -d '{
  "jiraKey": "SMART-XXXXX",
  "module": "smartweb",
  "rawTicket": "cole aqui o texto bruto do chamado do Jira"
}'
```

## O que falta preencher (os TODOs que importam)

1. **`src/infra/pbInsight.ts`** — plugar o RAG real. Hoje é stub.
2. **`modules/smartweb/CLAUDE.md`** — objetos-chave e armadilhas do módulo.
3. **Persistência** — trocar o Map em memória (`routes.ts`) pelo Prisma.
4. **UI Kanban** — front (Next.js) consumindo estas rotas. Fase seguinte.
5. **Loop pbtrace** — anexar trace antes/depois no estágio RESOLVIDO.

## Escopo do v1 (o que demonstrar primeiro)

A plataforma cobre o SMART Desktop inteiro, mas o v1 começa por **um módulo
piloto** — sugestão: **SMARTWEB**, porque já existe caso resolvido e documentado
pra usar de prova. Caminho "IA propõe / dev aplica", três estágios de ponta a
ponta (NOVO → ANALISE → DESENVOLVIMENTO) com o **diff aparecendo na tela**.
REVISAO e RESOLVIDO manuais no começo. Rodou num card real, o squad compra a
visão — e aí é só ir preenchendo os CLAUDE.md dos outros módulos.