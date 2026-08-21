# Guia de primeiros passos e boas práticas

- **Data:** 2026-08-21
- **Solicitação:** "adicione um botão na tela principal com um informativo de boas práticas, primeiros passos usando a plataforma"
- **Status:** concluído

## O que foi feito
1. **Botão "Como usar"** no cabeçalho do board, ao lado de Configurações.
2. **`components/GuideModal.tsx`** (novo), em três partes:
   - **Primeiros passos** (5 blocos numerados): configurar o Jira → criar o card
     com a chave → preencher "O que você já sabe" → revisar o que muda e onde →
     aceitar e versionar.
   - **Boas práticas** (5 itens, cada um com o porquê).
   - **O que a plataforma não faz** — expectativa alinhada logo de cara.
3. **Abre sozinho no primeiro acesso** de cada navegador
   (`localStorage: smart-ai-flow:guide-seen`); depois só pelo botão. Fecha com
   **Esc**, com clique fora e pelo X.

## Decisões
- **Conteúdo específico, não genérico.** Cada item saiu de algo que aconteceu ou
  que mediu diferença: a dica do dev que faz a busca achar o arquivo (com o
  número medido: 0 arquivos sem dica, o arquivo certo com ela), os objetos de
  nome gêmeo (`w_siscolo_*` × `w_sismama_*`), o `.pbl` que não pode subir. Guia
  que repete o óbvio ninguém lê duas vezes.
- **Uma seção só para o que a plataforma NÃO faz.** Não testa (por isso
  EVIDÊNCIAS sai em branco), não troca de branch, e pode errar — com o aviso
  vermelho de caminho inexistente explicado antes de o dev topar com ele.
- **Abrir uma vez sozinho.** Onboarding que depende de achar o botão não é
  onboarding; e modal que reaparece vira irritação.
- **Links diretos** para Minha conta, em vez de descrever o caminho.

## Verificação
- `tsc --noEmit`, `eslint` e `npm run build` (web): limpos.
- Container `web` reconstruído; board respondendo 200.
- **Não vi rodando** — a extensão do Chrome segue desconectada. O layout do
  modal, o comportamento do Esc e a abertura automática no primeiro acesso não
  foram conferidos visualmente.

## Pendências
- O guia é estático. Se um passo mudar (como o fluxo de aceite mudou hoje), o
  texto precisa ser atualizado à mão.
- Não há um "ver de novo" destacado para quem já fechou — só o botão no
  cabeçalho.
