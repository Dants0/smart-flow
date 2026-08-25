# Análise cortada no teto de tokens, e a auditoria não sabia dizer

- **Data:** 2026-08-24
- **Solicitação:** "O SMART-51229 deu esse erro, resposta não é JSON válido (Unexpected end of JSON input)... em outro momento era o tamanho da análise"
- **Status:** concluído — backend rebuildado; falta reprocessar o card

## O que o card mostrou

```
NOVO → ANALISE · card criado, disparando análise
ANALISE → ERRO  · resposta não é JSON válido (Unexpected end of JSON input)
```

A criação do card funcionou (era o bug de UTF-16 da sprint 07). Quem falhou foi
a análise: o modelo escreveu uma `rootCause` longa e um `reasoning` detalhado, e
a resposta acabou no meio de um item da lista — JSON que não fecha.

## O diagnóstico ficou pela metade, e isso é o segundo bug

A linha em `Run` da falha registrou:

```
stage=ANALISE  provider=desconhecido  model=desconhecido  inputTokens=0  outputTokens=0
```

O orquestrador só passava `provider/model/tokens` no caminho de sucesso. Na
falha gravava zero — justamente no caso em que os números decidem o
diagnóstico: **teto de saída baixo** (aumenta o teto) ou **modelo devolvendo
lixo** (mexe no prompt) pedem correções opostas, e a auditoria não distinguia.

O comentário da `AgentOutputError` já dizia "carrega a resposta crua **e o
consumo**". Carregava só a resposta — a classe nunca teve o campo.

## O que foi feito

1. **Teto de saída** — `analyzer` 4000 → **16000**, `proposer` 8000 → **16000**.
   Não é chute: a última análise que passou gastou **3492 de 4000 (87%)** e a
   última proposta **6507 de 8000 (81%)**. Estava no limite, e o próximo chamado
   um pouco maior estouraria de qualquer jeito. Teto é limite, não reserva: o
   custo é por token gerado, então teto alto não cobra a mais.
2. **`AgentOutputError` ganhou `usage`** (`LlmUsage` em `contracts.ts`) e o
   `jsonCall` anexa o consumo **somado das duas tentativas** mais o sinal de
   corte. Quando a resposta vem cortada, a mensagem passa a dizer quanto gastou
   e de qual teto: `resposta cortada no limite de tokens (16000 de 16000)`.
3. **`orchestrator`** grava esses campos na `Run` da falha.

`tsc` limpo, 135 testes passando.

## Decisões

- **Subir o teto E instrumentar.** Só subir o teto resolve este chamado e deixa
  o próximo diagnóstico igualmente cego — e este é o terceiro aumento
  (2000 → 4000 → 16000), sempre descoberto pelo mesmo caminho: dev reclama, alguém
  lê a resposta crua na mão. Com `outputTokens` gravado na falha, a próxima vez
  a resposta está na tabela.
- **16000, não 8000.** Dobrar repetiria o ciclo em alguns meses. Sonnet 5
  entrega bem mais que isso, e o retry ainda dobra o teto quando detecta corte.

## Pendências

- **Reprocessar o SMART-51229** (botão "reprocessar" no card em ERRO).
- **Configurações → Jira não explica o filtro** (apontado pelo dev). Proposta:
  legenda com as colunas escondidas, botão "restaurar padrão" e validação da
  JQL no salvar, reusando o `POST /me/jira/test`, que já sabe responder
  `jqlError` — hoje uma JQL inválida salva calada e o sintoma aparece longe da
  causa.
