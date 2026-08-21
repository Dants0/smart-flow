# Chamado e prints como contexto de busca

- **Data:** 2026-08-21
- **Solicitação:** "está usando como contexto o próprio texto do chamado? prints? muitas das vezes isso já dá um direcionamento direto para a fonte do problema"
- **Status:** concluído

## Diagnóstico
Conferido no código, o estado era desigual:

| | Texto do chamado | Prints | Busca de código |
|---|---|---|---|
| Analyzer | sim (e o RAG busca por ele, priorizando nomes `w_`, `d_`, `u_`) | sim, com instrução de ler mensagens de erro e telas | — |
| Proposer | sim | **não** | **só lia o texto da análise** |

Dois furos: o proposer estava cego aos prints, e a busca de código introduzida
hoje de manhã ignorava o chamado — justamente onde o nome da tela costuma
aparecer, inclusive na barra de título do screenshot.

## O que foi feito
1. **`gatherSourceMaterial` passou a receber o contexto inteiro** (chamado +
   análise) e a tentar **os identificadores do texto como nome de objeto**, não
   só o que a análise listou em `affectedObjects`. O arquivo certo é aberto mesmo
   quando a análise esquece de listá-lo.
2. **Prioridade explícita**: o que a análise apontou vem primeiro e ganha o
   orçamento de arquivos; o que veio do texto entra como complemento.
3. **`notFound` só acusa o que a análise nomeou** — palpite tirado do texto do
   chamado não vira acusação de objeto inexistente.
4. **O proposer recebe os prints** (`images: card.images`) com a mesma instrução
   que o analyzer já tinha: ler mensagens de erro, títulos de janela e estado da UI.
5. **O gate do orquestrador usa o mesmo contexto**, para não segurar um card cujo
   arquivo está nomeado no chamado.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `src/infra/sourceExcerpts.ts` | contexto completo + identificadores como candidatos |
| `src/agents/proposer.ts` | prints + chamado na busca |
| `src/orchestrator/orchestrator.ts` | gate com o mesmo contexto |

## Decisões
- **O chamado é fonte primária, não só matéria-prima da análise.** O suporte
  escreve o nome da tela; o print mostra o título da janela. Ignorar isso na
  busca de código era jogar fora a pista mais barata que existe.
- **Complemento, não substituição.** `affectedObjects` continua mandando na
  ordem: é a leitura já filtrada pela análise. O texto entra depois, para cobrir
  o que ela deixou passar.
- **Palpite não vira acusação.** Só objeto explicitamente nomeado pela análise
  entra em `notFound`; caso contrário, qualquer palavra parecida com
  identificador no chamado geraria alarme falso de "arquivo inexistente".

## Verificação
- `npm test`: 89 testes verdes; `typecheck` limpo nos dois projetos.
- **Teste de ponta a ponta no container**, com o cenário exato que você
  descreveu: análise citando **só** `u_dw_pac`, e o texto do chamado nomeando as
  telas. Resultado: os três arquivos abertos —
  `u_dw_pac.sru`, `w_sismama_citopatologico.srw` e `w_lea_aih.srw` —, sendo os
  dois últimos trazidos **exclusivamente pelo texto do chamado**.

## Pendências e um risco descoberto
- **Nomes gêmeos.** O repositório tem `w_siscolo_citopatologico.srw` **e**
  `w_sismama_citopatologico.srw`; o mesmo vale para histopatológico. A reanálise
  do SMART-50927 citou o `sismama`, enquanto a correção correta é no `siscolo`.
  Abrir o arquivo (o que a plataforma agora faz) é o que permite perceber a
  troca — mas nada avisa explicitamente sobre o gêmeo. Um alerta de
  "existe objeto de nome parecido" seria barato e evitaria diff na tela errada.
- `gatherSourceMaterial` ainda roda duas vezes por card (gate + proposer).
