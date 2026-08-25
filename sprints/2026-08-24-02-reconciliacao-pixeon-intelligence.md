# Reconciliação: documento Pixeon Intelligence × sistemas que já rodam

- **Data:** 2026-08-24
- **Solicitação:** "meu Tech Lead me mandou isso, dê uma lida" → "sim, faça isso" (montar o mapa do que já existe contra o que o documento propõe)
- **Status:** concluído

## Contexto

O Tech Lead escreveu o documento "Projeto Pixeon Intelligence v1.0" sem
conhecimento do `pb-insight`, do `smart-ai-flow` e do `app_trace`. O checklist
marca como pendentes itens que já estão em produção interna.

## O que foi feito

Inventário dos três projetos lendo o código (não de memória) e mapeamento item
a item contra as seções 2 a 5 do documento e o checklist de acompanhamento.
Resultado publicado como artifact para a conversa com o Tech Lead.

**Placar:** 26 itens mapeados — 8 já existem, 6 parciais, 10 novos, 2 migrações.

**Já existe (o achado principal):** ingestão Jira com Basic Auth v8 e JQL
validada, ingestão Bitbucket com PR e dedupe, filtragem JQL, vetorização de
tickets, processamento de dependências (15.982 objetos / 46.123 arestas / 59 s)
e — o mais relevante — o **interpretador de trace de banco da seção 4, que é o
`app_trace` inteiro**: Go, dockerizado, template mining, severidade, 5
provedores de LLM, já integrado à esteira via `traceService.ts`.

**Genuinamente novo, em ordem de valor:** exportador de cenários anonimizados;
análise de `.ini`; mapeamento de uso seletivo (`objeto_uso_aplicacao`);
mineração Callcenter/TWIKI; vetorização do código-fonte.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `scratchpad/reconciliacao-pixeon.html` | novo — documento publicado em https://claude.ai/code/artifact/a1137e6a-d7da-45b7-82b3-e3d67a8babb5 |

Nenhum código de produção tocado — entrega é documento de decisão.

## Decisões

- **A busca do pb-insight é léxica, não vetorial.** Conferido em
  `in-memory-search-index.ts` (varredura por substring). A vetorização de
  código do Pixeon é complementar de verdade, não duplicação — importante não
  ter classificado como "já existe".
- **Neo4j defendido por expressividade, não por escala.** 15.982 objetos cabem
  em memória e ingerem em 59 s; o argumento de Big Data não sobrevive a uma
  pergunta. O argumento que se sustenta é consulta ad-hoc: o
  `FindPatternSiblingsUseCase` (sprint 01 de hoje) precisou de um caso de uso
  inteiro em TypeScript para uma pergunta que em Cypher são duas linhas.
- **Streamlit posicionado como ferramenta de exploração do grafo**, não como
  interface do produto — já existe app Next.js com auth, quadro, chat, diff e
  telas de configuração. Refazer seria regressão.
- **A tabela de ROI mede as coisas erradas.** O SMART-50927 foi rápido, barato
  em tokens e bem formatado — e errado no escopo (1 de 6 janelas). Nenhuma das
  5 linhas da tabela teria pegado. Propostas 3 métricas substitutas
  (cobertura de objetos afetados, taxa de alucinação de caminho, retrabalho
  pós-proposta).
- **Ressalva sobre a seção 6 (auto-correção):** autonomia não corrige
  recuperação incompleta, multiplica. Abrangência precisa ser critério de
  aceite, não consequência.

## Pendências

- As três decisões de arquitetura (Neo4j, Streamlit, destino único de dados)
  dependem da conversa com o Tech Lead.
- Continua pendente da sprint 01: aplicar a correção nos 6 `.srw` do `mwsus` e
  rebuild do container do pb-insight para o endpoint `/siblings` valer no
  ambiente rodando.
