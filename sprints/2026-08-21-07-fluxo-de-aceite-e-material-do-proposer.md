# Fluxo de aceite explícito e material do proposer corrigido

- **Data:** 2026-08-21
- **Solicitação:** mover a seção "o que aplicou de fato"; resposta do proposer mais direta ("dar direcionamento em linguagem natural, o que investigar, ou o ponto do código"); renomear para "Aceitar e Versionar"; e a dúvida: "quando o usuário aceita, a IA está alterando o código diretamente e já passa para o versionamento?"
- **Status:** concluído

## O bug que a própria resposta denunciou
O card recusou propor dizendo que só recebeu "forward prototypes, sem o corpo das
funções". Estava certo — e a culpa era da extração de código que eu escrevi de
manhã:

- em `u_dw_pac.sru`, `uof_testar_status` aparece na **linha 83** (assinatura,
  dentro do bloco `forward prototypes`, linhas 72–88) e na **linha 1903** (corpo);
- o `git grep -C25` varria de cima pra baixo e o teto de 8 mil caracteres
  fechava o orçamento no bloco de assinaturas, **nunca chegando ao corpo**.

### Correção
`selectExcerpt()` reescrito: lê o arquivo inteiro, **pula as faixas
`forward prototypes`…`end prototypes`**, identifica **definições com corpo**
(assinatura seguida de `;`, como `public function ... uof_testar_status (...);`
ou `event avancar;call super::avancar;`) e recorta **para frente** — corpo de
função corre pra baixo, não em volta. Chamadas simples entram depois, com
contexto curto.

Conferido no repositório real: agora vem `1903: public function boolean
uof_testar_status (...)` e `150: event avancar;call super::avancar;`, sem o bloco
de prototypes.

## Resposta à dúvida do fluxo (e a mudança que ela motivou)
**Não**, aceitar nunca alterou código. Mas a tela mostrava ao mesmo tempo
"aplicar o diff", "o que você aplicou de fato" e "aceitar e resolver" — três
coisas de momentos diferentes —, então a pergunta era inevitável. Agora cada
estágio pede **uma decisão**:

- **REVISÃO**: `Rejeitar, pedir nova proposta` ou **`Aceitar e versionar`**.
  Nada é escrito no código aqui; aceitar só move o card. O texto abaixo dos
  botões diz isso. Há um caminho discreto "resolver sem versionar" para chamado
  que não gera PR.
- **VERSIONAMENTO**: passo a passo numerado — 1) aplicar o diff (ou editar na
  mão), 2) commitar, 3) push + PR, 4) comentário no Jira, 5) **resolver**, e é
  no passo 5 que mora o "o que você aplicou de fato". É a última coisa que o dev
  sabe, não a primeira.
- **ERRO**: reprocessar.

A nota de rejeição só aparece **depois** de clicar em rejeitar — antes ocupava
meia tela sem motivo.

## Outras mudanças
- **Proposer sem material agora é direto**: o prompt exige `summary` de uma
  frase ("Falta o corpo do evento avancar de w_lea_aih.srw"), `rationale` de no
  máximo 3 frases dizendo **onde investigar** (arquivo, linha, evento), e proíbe
  listar o que recebeu ou explicar regras internas.
- **A tela trata isso como investigação, não como plano vazio**: bloco âmbar
  "Falta material para propor o diff" + "O que investigar" + "Como confirmar",
  em vez de "Onde muda: 0 arquivo(s) · +0 −0".
- **`POST /cards/:id/accept`** (novo): REVISÃO → VERSIONAMENTO sem tocar em
  código. O commit passou a aceitar card já em VERSIONAMENTO.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `src/infra/sourceExcerpts.ts` | `selectExcerpt`, `prototypeRanges`, `isDefinitionStart` |
| `src/agents/proposer.ts` | resposta curta e direta quando falta material |
| `src/http/routes.ts` | rota `accept`; commit a partir de VERSIONAMENTO |
| `web/components/card/CardActions.tsx` | reescrito: uma decisão por estágio |
| `web/components/card/VersioningPanel.tsx` | reescrito: 5 passos numerados |
| `web/components/card/ChangePlan.tsx` | bloco de investigação |
| `web/lib/api.ts` | `acceptCard` |

## Decisões
- **Uma decisão por estágio.** A confusão não era falta de texto explicativo: era
  ter três ações de momentos diferentes na mesma tela.
- **"O que aplicou de fato" no passo 5.** Perguntar isso antes de o dev aplicar
  qualquer coisa é pedir que ele adivinhe o próprio futuro.
- **Definição antes de assinatura.** Em fonte PowerBuilder o topo do arquivo é
  todo assinatura; qualquer busca ingênua enche o orçamento com ela.
- **Recortar pra frente, não em volta.** `-C25` centra na ocorrência; corpo de
  função precisa das linhas seguintes.
- **Sem diff não é proposta.** A tela precisa parecer o que é — um pedido de
  investigação com um endereço.

## Verificação
- `npm test`: 89 verdes. `typecheck`, `eslint`, `build` (web) limpos.
- **Teste no container contra o repositório real**: o material agora traz o corpo
  da função (linha 1903) e do evento (linha 150), com o bloco de prototypes fora.
- Rotas no ar (`/cards/:id/accept` responde 401 sem token), web em 200.
- **Não vi as telas rodando** (extensão do Chrome desconectada) e **não
  reprocessei o card** — com o material corrigido, o resultado do proposer deve
  mudar bastante, mas isso consome tokens e é decisão sua.

## Pendências
- A gaveta lateral do board ainda usa o layout antigo.
- O `ChangePlan` não mostra o código atual ao lado do diff (só o diff). Com o
  material bom no backend, dá pra exibir o trecho real do arquivo junto.
