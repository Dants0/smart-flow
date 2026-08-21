# CLAUDE.md do backend atualizado

- **Data:** 2026-08-21
- **Solicitação:** "atualize o CLAUDE.md do backend com base nas últimas informações... a convenção do commit é `:bug:fix SMART-XXXXX <descrição direta>`"
- **Status:** concluído

## O que foi feito
1. **`smart-ai-flow/CLAUDE.md` reescrito** a partir de um inventário real do
   código (arquivos de `src/`, modelos do Prisma, scripts do `package.json`,
   testes) — não de memória.
2. **Removida a seção "O que falta preencher"**, que estava inteiramente
   desatualizada: dizia que o PB Insight era stub, que a persistência era um
   `Map` em memória e que a UI Kanban era "fase seguinte". As três coisas
   existem. Um agente lendo aquilo trabalhava com um mapa falso do projeto.
3. **Removida a seção "Escopo do v1"** (módulo piloto SMARTWEB), superada.
4. **Adicionado o que passou a existir**: estágio VERSIONAMENTO, as duas paradas
   antecipadas (`needsTrace` e caminho inventado), os dois repositórios do
   cliente com raiz/companheiro/origin de cada um, a regra de commit, e as
   convenções do backend (segredo cifrado, credencial redigida, disjuntor do
   Jira, auditoria que não derruba pipeline).
5. **Convenção de commit fixada**: `:bug:fix SMART-XXXXX <descrição direta>`.
   Conferido que `commitMessage()` em `infra/git.ts` já produz exatamente isso.
6. **Seção "Ao mexer aqui"**: testar o que decide, migração obrigatória,
   reconstruir containers, documentar em `sprints/`.
7. **Memória `regra-commit-smart-desktop` atualizada** com a convenção
   autoritativa, os dois repositórios, `.sr?` + `.prp`, e a armadilha do
   `<lib>.pbl.src/`.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/CLAUDE.md` | reescrito |
| memória `regra-commit-smart-desktop` | convenção de commit + smart_web |

## Decisões
- **Inventariar antes de escrever.** O documento anterior errou por descrever de
  memória; usei `ls src/**`, `grep '^model' schema.prisma` e a lista de testes
  para que cada afirmação corresponda a um arquivo que existe.
- **Separar os dois briefings.** O `CLAUDE.md` do backend é sobre *esta*
  aplicação; o do código do cliente vive em `modules/<sistema>/CLAUDE.md`. A
  primeira linha do arquivo agora diz isso, porque a confusão entre os dois é o
  caminho mais curto pra alucinação.
- **As decisões que já custaram caro viraram texto**: o SMART-50927 é citado
  como o motivo das duas paradas antecipadas. Regra sem motivo é regra que o
  próximo alguém remove.

## Verificação
- Inventário conferido: 4 pastas em `src/`, 19 arquivos em `infra/`, 9 modelos e
  enums no Prisma, 9 arquivos de teste, scripts do `package.json`.
- `commitMessage()` confere com a convenção declarada.
- Nenhum código alterado nesta solicitação — só documentação e memória.

## Pendências
- O `CLAUDE.md` do **repositório do cliente** (`C:\controle de versão\smart_desktop`)
  continua com os seis problemas levantados na análise anterior, entre eles a
  ausência de `ws_objects/` e cinco skills inexistentes. Não toquei: é repo
  compartilhado. A proposta de correção segue de pé, é só pedir.
