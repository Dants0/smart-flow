# Consumo de IA por usuário no Monitor de Recursos

- **Data:** 2026-09-17
- **Solicitação:** "na tela de monitor de recursos, os gastos e tokens deve ser pertinentes a cada usuário... atualmente, ele está contabilizando geral, ou seja, criei a conta de outro usuário e fui na parte de monitor de recursos já está contabilizando os gastos de toda a plataforma"
- **Status:** concluído

## Diagnóstico
A tabela `Run` (uma linha por chamada ao LLM) não guardava **quem** gastou, e
`usageSummary` somava todas as linhas dos últimos 30 dias. Qualquer conta nova
abria o painel e via o gasto da plataforma inteira como se fosse dela.

## O que foi feito
1. **`Run.userId`** (FK para `User`, `ON DELETE SET NULL`, índice `userId, at`).
   Migração `20260917120000_consumo_por_usuario` **preenche o histórico** com o
   dono do card (`Card.createdById`).
2. **Quem é gravado como quem gastou:**
   - estágios da esteira (análise, proposta, falhas) → dono do card;
   - chat do card → quem fez a pergunta (pode ser o admin olhando card alheio).
3. **`GET /monitor` recorta o consumo** com a mesma regra do board
   (`recorteDeDono`): dev vê só o dele, sem como desligar; admin começa pelo dele
   e pede `?escopo=plataforma` para o total. A resposta diz qual escopo veio.
4. **Tela**: título vira "Meu consumo de IA" ou "Consumo de IA da plataforma", e o
   admin ganha o seletor "Meu consumo / Toda a plataforma".
5. Limpeza da sprint anterior: `/auth/bootstrap` saiu da lista de rotas públicas do web.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/prisma/schema.prisma` | `Run.userId` + relação e índice |
| `smart-ai-flow/prisma/migrations/20260917120000_consumo_por_usuario/migration.sql` | coluna, backfill, FK, índice |
| `smart-ai-flow/src/infra/runRepository.ts` | `recordRun` grava `userId`; `usageSummary` recorta |
| `smart-ai-flow/src/orchestrator/orchestrator.ts` | consumo atribuído ao dono do card |
| `smart-ai-flow/src/http/routes.ts` | chat atribuído a quem pergunta; `/monitor` com recorte |
| `web/lib/api.ts` | `fetchMonitor(escopo)`, `UsageSummary.escopo` |
| `web/app/settings/resources/page.tsx` | título por escopo e seletor do admin |
| `smart-ai-flow/CLAUDE.md` | nota sobre `Run.userId` |

## Decisões
- **Reaproveitar `recorteDeDono`** em vez de regra nova: "o dev vê o que é dele,
  o admin pode ver tudo" já é a régua do board, e ter duas réguas diferentes pra
  mesma pergunta é como elas saem de sincronia.
- **Admin abre no consumo dele**, não no total: a queixa era o número não bater
  com a realidade de quem olha, e isso vale pro admin também.
- **Chat antigo vai pro dono do card** no backfill: a linha não guardava quem
  perguntou, e na prática é quase sempre o próprio dono.
- Status dos serviços e **fila** continuam globais: são da plataforma, não gasto
  de alguém.

## Verificação
- Backend: 235 testes verdes, `typecheck` e `prisma validate` limpos.
- Web: `tsc` e `eslint` limpos.
- **Migração não aplicada num banco real nesta sessão** — roda no start do
  container (`prisma migrate deploy`).

## Pendências
- Reconstruir `backend` e `web` (`docker compose up -d --build backend web`).
- Apagar um card continua apagando o consumo dele (`Run` tem cascade pelo card) —
  comportamento anterior, agora visível por usuário. Se o gasto precisar
  sobreviver ao card, vale trocar o cascade.
