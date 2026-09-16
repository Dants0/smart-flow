# Comentários do chamado e a análise prévia do n8n como contexto

- **Data:** 2026-09-16
- **Solicitação:** "quando puxar as informações do card do chamado também deve trazer os comentários porque recentemente integramos n8n para análise prévia do chamado, aí os líderes sugeriram integrar isso ao contexto da aplicação para ser ainda mais resolutivo."
- **Status:** concluído

## O que foi feito
1. **`fetchJiraIssue` traz os comentários.** O texto do chamado passa a ser
   título + descrição + a seção `--- Comentários do chamado (mais antigo primeiro) ---`,
   com autor e data de cada comentário. O GET do issue já traz os comentários
   embutidos; quando o Jira pagina esse bloco (`total` maior que o que veio), a
   lista inteira é buscada em `/rest/api/2/issue/{key}/comment`.
2. **Formatação pura e testada** em `domain/ticketComments.ts`:
   - comentário vazio é ignorado;
   - **a entrega que a própria plataforma publicou fica de fora** (começa com
     `*MÓDULOS IMPACTADOS:*`) — recriar o card de um chamado já entregue faria a
     IA ler a própria resposta como relato do suporte;
   - teto de 6.000 caracteres por comentário e 20.000 no total; estourando,
     **ficam os mais recentes** (a análise do n8n e o último retorno) e a seção
     avisa quantos antigos saíram.
3. **Regra nos dois agentes** (system prompt do analyzer e do proposer): relato
   humano no comentário é **evidência**; análise prévia automatizada (n8n) é
   **hipótese** — ponto de partida das buscas, confirmada com as ferramentas
   antes de ser repetida. Divergência vira linha `ANÁLISE PRÉVIA:` em reasoning.
4. `CLAUDE.md` do backend atualizado (contexto da IA, estrutura, contagem de testes).

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/src/domain/ticketComments.ts` | novo — formata, filtra e limita os comentários |
| `smart-ai-flow/src/infra/jiraService.ts` | busca os comentários (com paginação) e anexa ao `rawTicket` |
| `smart-ai-flow/src/agents/analyzer.ts` | seção "Comentários do chamado" no system prompt |
| `smart-ai-flow/src/agents/proposer.ts` | idem, versão curta |
| `smart-ai-flow/tests/ticketComments.test.ts` | novo — 5 testes |
| `smart-ai-flow/CLAUDE.md` | contexto da IA e estrutura |

## Decisões
- **Dentro do `rawTicket`, não campo novo.** Sem migração, e o texto chega sem
  mudança a tudo que já lê o chamado: analyzer, proposer, chat, busca literal
  por string de tela, RAG do PB Insight e a pesquisa do board. E o dev **vê e
  edita** os comentários no modal antes de criar o card — dá pra apagar um
  comentário que só atrapalha.
- **Análise do n8n é hipótese, não evidência.** É outra IA, sem as ferramentas
  de busca no repositório. O SMART-52132 mostrou o custo de o modelo agarrar o
  primeiro nome de objeto concreto que tem à mão; um objeto citado pelo n8n é
  exatamente esse tipo de isca. Por isso a regra manda usá-lo como ponto de
  partida e confirmar com `buscar_objeto` antes de citá-lo. O direcionamento do
  dev (`devHints`) continua acima de tudo.
- **Mais recentes primeiro na hora de cortar.** Triagem do primeiro dia costuma
  estar superada pelo que veio depois.
- **Falha ao buscar comentários não impede criar o card**, exceto negação de
  autenticação, que continua armando o disjuntor do Jira.

## Verificação
- `npm test`: 225 testes verdes (5 novos); `npm run typecheck` limpo.
- **Não testado contra o Jira real** nesta sessão — a formatação é coberta por
  teste, a chamada HTTP segue o contrato da REST API v2 do Jira Server
  (`fields.comment.comments[]`, `author.displayName`, `body`, `created`).

## Pendências
- Conferir com um chamado real que tenha comentário do n8n: se a análise
  automatizada tiver autor fixo (usuário de serviço), dá pra rotulá-la
  explicitamente como `[análise prévia automatizada]` em vez de depender do
  modelo reconhecer pelo nome do autor.
- Cards já criados não ganham os comentários; é preciso recriar o card para puxá-los.
- Reconstruir o container do `backend` para valer (`docker compose up -d --build backend`).
