# Direcionamento do dev na criação do card

- **Data:** 2026-08-21
- **Solicitação:** "tornar possível na etapa de criação do chamado o próprio dev incrementar com mais informações, porque isso ajuda a direcionar a resolução — alguma query a mais, uma DataWindow específica"
- **Status:** concluído

## O que foi feito
1. **Campo "O que você já sabe"** no modal de novo card (opcional), com exemplos
   no placeholder: objeto suspeito, DataWindow, query, o que já foi descartado.
2. **`Card.devHints`** (migração `20260821170000_dev_hints`), passando por
   domínio, repositório, schema Zod (teto de 4.000 caracteres) e rota de criação.
3. **Entra no prompt como EVIDÊNCIA, não sugestão.** No analyzer, vem **antes**
   do texto do chamado, com instrução explícita: "escrito por um desenvolvedor do
   time, com acesso ao sistema e ao banco; contradizer isso exige motivo no
   raciocínio".
4. **Entra na BUSCA — a parte que dá o ganho real.** A dica é concatenada ao
   contexto usado por:
   - `retrieveContext` (RAG do PB Insight),
   - `gatherSourceMaterial` (abre os objetos citados no repositório),
   - o gate do orquestrador e o chat do card.
5. **Aparece na revisão**, num bloco próprio entre o chamado e a causa raiz —
   explica por que a análise foi por aquele caminho.

## Verificação
- **Teste no container**, com chamado deliberadamente vago
  ("O sistema deixa o usuário prosseguir quando não deveria."):

  | | Arquivos abertos |
  |---|---|
  | sem dica | **0** |
  | com dica ("acho que é a `uof_testar_status` do `u_dw_pac`") | **2**, incluindo o corpo da função |

- `npm test`: 102 verdes. `typecheck`, `eslint` e `build` (web) limpos.
- Migração aplicada; coluna `devHints` conferida no Postgres.

## Decisões
- **Dica é evidência, não palpite.** É a única parte do prompt escrita por
  alguém com o sistema na frente. O prompt diz isso ao modelo em vez de tratar
  como "mais um texto".
- **A dica dirige a busca, não só a redação.** Era o que faltava pro campo valer
  a pena: citar `d_agm09tab` faz a plataforma abrir aquele arquivo. Sem isso
  seria só mais texto no prompt.
- **Opcional e sem formato.** O dev escreve como pensa; qualquer campo estruturado
  (objeto/tipo/motivo) viraria formulário e deixaria de ser preenchido.
- **Visível na revisão.** Quem revisa semanas depois precisa saber que a análise
  foi conduzida por uma pista humana — e qual foi.

## Pendências
- A dica só pode ser escrita **na criação**. Um card que já está em análise não
  tem como receber direcionamento novo sem ser recriado — o caminho hoje é
  "Rejeitar, pedir nova proposta" com nota, ou o chat.
- O campo não é usado no `buildJiraComment` (não faz parte da entrega, é
  contexto interno).
