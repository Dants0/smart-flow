# "Falta material para propor o diff": o modelo estava certo, o orçamento é que era pequeno

- **Data:** 2026-08-25
- **Solicitação:** "tenho percebido uma resistência da IA para propor alteração em código, preciso que ela seja mais maleável... já temos um RAG e ainda assim não consegue pegar?"
- **Status:** concluído — backend rebuildado, material conferido contra o repositório real

## O número que explica tudo

```
w_agd03.srw ................ 282.540 caracteres
MAX_CHARS_PER_FILE ......... 24.000  (8,5% do arquivo)
```

O proposer respondia *"falta o trecho de w_agd03.srw que efetivamente abre a
janela 'Visualizar (Instruções)'"* — e era **verdade**. Ele recebeu 8% da
janela. A parte que faltava não estava escondida em lugar nenhum: estava no
mesmo arquivo, fora do recorte.

Não era teimosia do modelo nem falha do RAG. Era orçamento.

## O que foi feito

**1. Orçamento (`sourceExcerpts.ts`).**

| | antes | agora |
|---|---|---|
| por arquivo | 24.000 | 96.000 |
| total | 72.000 | 240.000 |
| arquivos | 6 | 10 |
| bloco sem terminador | 400 linhas | 800 |

240.000 caracteres são ~65 mil tokens de entrada — folgado em Sonnet 5. Entrada
custa, mas custa menos que um diff que não sai.

**2. Busca literal no repositório (nova passada).** Responde sozinha as duas
perguntas com que a análise costumava terminar, e que viravam tarefa manual:

- *"quem desenha a tela que mostra este texto"* — literais entre aspas do
  chamado viram `git grep -F`.
- *"quem chama esta função"* — termo citado no código lido e definido em lugar
  nenhum do material vira busca.

**3. Ordem das passadas.** Objetos da análise → **busca dirigida** → ancestrais.
Antes os ancestrais genéricos (`u_datawindow_padrao`, `u_dw_pac`) comiam 164 mil
dos 240 mil e a busca dirigida nem chegava a rodar.

**4. Prompt do proposer.** "Diff vazio é o ÚLTIMO recurso, não o primeiro."
Passou a ser explícito que **assumir e avisar não é o mesmo que inventar**:
nome de arquivo, função e objeto continuam tendo que existir no material (é a
regra que evitou o diff-ficção do SMART-50927), mas sobre o COMPORTAMENTO do
código o modelo pode raciocinar por hipótese, desde que declare em `risks`
"assumido sem ver o código de X".

11 testes novos — 151 no total (era 140).

## Duas descobertas do caminho

- **`'Visualizar (Instruções)' não existe no fonte.** O `git grep` não acha em
  lugar nenhum do repositório: o título vem de banco/INI, ou o modelo o inferiu
  do print. Ou seja, aquele pedido específico da análise era impossível de
  atender por leitura de código — e agora a plataforma ao menos tenta antes de
  devolver a bola pro dev.
- **Busca literal por palavra solta é veneno.** A primeira versão usava a maior
  palavra ASCII do literal ("Visualizar") e trouxe quatro telas de auditoria sem
  relação, roubando orçamento de quem tinha o código. Corrigido para o maior
  **trecho contíguo** (`"Visualizar (Instru"`), que é distintivo. E só termos
  vindos do chamado/análise viram busca — os colhidos do próprio código são
  genéricos demais (`of_get_row`, `i_sistema`).

## Verificação

Mesmo chamado, mesma rota, depois do rebuild:

```
antes:  w_agd03.srw = 24.000 chars   wf_seleciona_horario: sem corpo
depois: w_agd03.srw = 95.793 chars   wf_seleciona_horario: DEFINIÇÃO COM CORPO
material: 6 arquivos, 247.483 chars, todos do domínio da agenda
```

151 testes, `tsc` limpo.

## O que isto NÃO muda

A regra "nunca invente caminho, função ou objeto" continua de pé, e deve
continuar: foi ela que impediu, no SMART-50927, um diff inteiro contra arquivos
inexistentes. A maleabilidade que entrou é sobre **hipótese declarada**, não
sobre inventar nome — as duas coisas se parecem no texto e são opostas no
resultado.

## Pendências

- Reprocessar o SMART-51229 e ver se agora sai diff.
- Dispensa do banner sem desfazer (sprint 06); `@default` da JQL com ids desta
  instância (sprint 10); 6 `.srw` do `mwsus` (SMART-50927).
