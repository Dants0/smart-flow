# Código truncado: bloco inteiro em vez de janela fixa

- **Data:** 2026-08-21
- **Solicitação:** "por que os dados estão truncados? sendo que o pb-insight tem posse do conteúdo na íntegra?" — o modelo relatou receber o evento `avancar` de `w_sismama_citopatologico.srw` cortado da linha 194 até 341
- **Status:** concluído

## Diagnóstico
O truncamento era meu, em **dois** lugares — e nenhum deles era o PB Insight:

1. **`selectExcerpt` cortava numa janela fixa de 90 linhas** a partir do início da
   definição. O evento `avancar` daquele arquivo vai da linha **189 à 333** (145
   linhas): o modelo recebia até a ~279 e perdia justamente o miolo. Ele
   percebeu e avisou — pior seria não perceber.
2. **`SNIPPET_CHARS = 3000` no `pbInsight.ts`**: o serviço devolve o corpo
   completo do evento (`GET /objects/:obj/events/:evt`) e o backend cortava em 3
   mil caracteres antes de mandar pro prompt.

## O que foi feito
1. **`blockEnd()`** (novo): acha o fim real do bloco procurando `end event`,
   `end function`, `end subroutine`, `end type` ou `end prototypes`. Fonte
   exportado do PowerBuilder sempre fecha assim, então o corte deixou de ser
   chute.
2. **Teto de segurança com aviso**: bloco que não fecha em 400 linhas é cortado,
   mas o trecho ganha `[CORTADO: o bloco continua além da linha N]`. O modelo
   precisa saber que está raciocinando sobre código incompleto.
3. **Orçamento ampliado**: 24 mil caracteres por arquivo, 72 mil no total — um
   evento de 300 linhas cabe inteiro.
4. **`SNIPPET_CHARS` de 3.000 → 12.000** no cliente do PB Insight.
5. **4 testes novos** de `blockEnd` e `selectExcerpt`, incluindo o caso do bloco
   sem terminador.

## Verificação
- **Teste no container contra o arquivo real**: o evento agora vem de
  `189: event avancar;call super::avancar;` até `333: end event` — **145 linhas,
  completas**, com o `MessageBox` da linha 210 dentro do trecho. Em
  `u_dw_pac.sru`, o corpo de `uof_testar_status` fecha com `end function`.
- `npm test`: 9 arquivos, **93 testes** verdes. `typecheck` limpo.
- Backend reconstruído.

## Decisões
- **Terminador, não contagem.** Qualquer número fixo de linhas erra: 90 era
  pouco pra um evento de 145, e 400 seria demais pra um de 12. O `end event` é o
  fato; a contagem era palpite.
- **Corte tem que ser visível.** Silenciosamente entregar meio bloco é o pior
  caso: o modelo raciocina achando que viu tudo. O aviso `[CORTADO]` custa uma
  linha.
- **Aumentar o teto, não removê-lo.** O material entra no prompt e é pago por
  card; sem limite, um objeto de 4 mil linhas consumiria a janela inteira.

## Pendências
- O PB Insight é usado só na busca por palavra-chave (`retrieveContext`). Para os
  objetos que a análise **nomeia**, a plataforma lê direto do working copy. Dá
  pra usar o endpoint de evento do PB Insight também nesse caminho — ele já tem
  o grafo e o intervalo exato de cada evento, o que dispensaria a heurística de
  terminador. Vale se a heurística falhar em algum formato de fonte.
- Continua valendo a lacuna nº 1 do Auto Mode: seguir a corrente de herança
  (`call super::`) e o tipo declarado dos controles.
