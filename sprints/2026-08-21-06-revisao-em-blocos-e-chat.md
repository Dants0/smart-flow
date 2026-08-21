# Revisão em blocos e chat de dúvidas

- **Data:** 2026-08-21
- **Solicitação:** "na tela de revisão completa do chamado em /cards... está scroll chamado > análise > raciocínio > objetos > histórico. Essa etapa deve mostrar o que deve ser alterado, onde deve ser alterado... separe em blocos, mantendo Rejeitar / nova proposta / aceitar. De quebra adicione um chat para dúvidas pontuais sobre a resolução, com contexto do chamado, solução proposta, análise, histórico e raciocínio"
- **Status:** concluído

## O problema
A página era o mesmo componente da gaveta, num scroll único: chamado → trace →
análise → raciocínio → objetos → **proposta** → histórico. O diff, que é o
assunto, ficava no meio do caminho, e a tela nunca respondia de forma direta
"quais arquivos mudam e em que linhas".

## O que foi feito

### Layout em blocos
1. **`ChangePlan`** (novo) — a coluna principal, na ordem **o que muda → onde
   muda → por quê**:
   - resumo da proposta em destaque;
   - **lista de arquivos** com nome, pasta (é o que distingue objetos de nome
     parecido, como `w_siscolo_*` × `w_sismama_*`) e contagem `+N / −M`;
   - **faixas de linha** de cada hunk, visíveis sem abrir o diff;
   - diff **por arquivo**, colapsável — um arquivo só já abre;
   - "Por que" e "Como testar" lado a lado; riscos em bloco âmbar;
   - o aviso de caminho inventado vem **antes** de tudo, porque muda como se lê
     o resto.
2. **`lib/diff.ts`** (novo): parser de diff unificado por arquivo, com hunks,
   contagem e a linha inicial de cada trecho. Diff sem cabeçalho de arquivo não
   se perde — vira um bloco sem nome.
3. **`CardEvidence`** (novo): a coluna de apoio — chamado, causa raiz,
   raciocínio, objetos apontados, trace e histórico, cada um num bloco
   colapsável. Chamado e causa raiz abrem por padrão; o resto fica recolhido.
4. **Barra de decisão fixa** no rodapé com Rejeitar / Aceitar (e Reprocessar em
   ERRO): decidir não pode depender de ter rolado até o fim.
5. **Responsivo**: abaixo de `lg` a coluna lateral vira um `<details>` no fim da
   página, em vez de espremer duas colunas.

### Chat
6. **`agents/chat.ts`** (novo): responde com o card inteiro no contexto —
   chamado, prints, trace, análise, raciocínio, objetos, proposta com o diff,
   histórico, briefing do módulo e **o código real** dos objetos citados.
7. **Persistido** (`ChatMessage`, migração `20260821140000_chat`): a dúvida e a
   resposta são parte da história da resolução, não conversa efêmera.
8. **Auditado**: cada resposta grava linha em `Run` com provider, modelo e
   tokens, no estágio atual do card.
9. **`CardChat`** (novo): aba "Perguntar" ao lado de "Evidência", com sugestões
   de partida, Enter pra enviar, eco otimista da pergunta e devolução do texto
   ao campo se a chamada falhar.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `web/app/cards/[id]/page.tsx` | reescrita: duas colunas, abas, barra de ação fixa |
| `web/components/card/ChangePlan.tsx` | novo |
| `web/components/card/CardEvidence.tsx` | novo |
| `web/components/card/CardChat.tsx` | novo |
| `web/lib/diff.ts` | novo — parser por arquivo |
| `web/lib/api.ts` | cliente do chat |
| `smart-ai-flow/src/agents/chat.ts` | novo |
| `smart-ai-flow/src/infra/chatRepository.ts` | novo |
| `smart-ai-flow/src/http/routes.ts`, `schemas.ts` | rotas do chat |
| `smart-ai-flow/prisma/schema.prisma` + migração | `ChatMessage` |

## Decisões
- **O diff é o assunto, a evidência é apoio.** Inverti a hierarquia: o que muda
  ocupa a coluna larga; de onde veio fica ao lado, recolhido, para conferir.
- **Diff por arquivo, não um bloco só.** Com 4 arquivos alterados (o caso do
  SMART-50927), o `<pre>` único obriga o dev a caçar os `+++`.
- **A pasta aparece junto do nome.** O repositório tem objetos gêmeos
  (`w_siscolo_citopatologico` × `w_sismama_citopatologico`); nome sem caminho é
  ambíguo justamente onde erra mais.
- **Chat persistido e auditado**, como o resto: se gasta token, aparece no
  Monitor; se ajuda a decidir, fica no histórico do card.
- **Uma aba de cada vez.** Evidência e chat dividem o mesmo espaço porque o uso é
  alternado — conferir a análise, ou perguntar sobre ela.
- **Sugestões de partida no chat vazio.** Campo de texto em branco não diz o que
  ele sabe responder; três perguntas concretas dizem.

## Verificação
- `npm test` (backend): 89 testes verdes. `typecheck`, `eslint` e `npm run build`
  (web): limpos, rota `/cards/[id]` no build.
- Migração aplicada e tabela `ChatMessage` criada; `GET /cards/:id/chat` responde
  401 sem token; a página responde 200.
- **Não verifiquei visualmente nem exercitei o chat com o modelo real** — a
  extensão do Chrome segue desconectada, e a primeira pergunta de verdade
  consome tokens da chave de vocês. Vale abrir um card em REVISÃO e testar.

## Pendências
- O chat manda a conversa inteira a cada pergunta: barato pra dúvida pontual,
  caro se virar thread longa. Não há corte de histórico.
- Não há como apagar mensagem do chat.
- A gaveta lateral do board continua com o layout antigo (scroll único). Se
  fizer sentido, ela pode passar a usar o `ChangePlan` também.
