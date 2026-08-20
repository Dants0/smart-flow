# Esc fecha o painel e página inteira do card

- **Data:** 2026-08-20
- **Solicitação:** "fechar a aba lateral quando o card está aberto com ESC" e "abrir o chamado inteiro na aba seguinte clicando em seu número"
- **Status:** concluído

## O que foi feito

### Refatoração que veio antes (necessária)
1. **`components/card/CardContent.tsx`** (novo): as seções do card — chamado,
   trace, análise, proposta, histórico — mais o lightbox de screenshot.
2. **`components/card/CardActions.tsx`** (novo): as ações dos gates REVISÃO
   (aplicar diff, desfazer, rejeitar, aceitar e resolver) e ERRO (reprocessar).
3. **`CardDetail`** passou a compor os dois. Sem essa extração, a página inteira
   seria uma cópia de 400 linhas que divergiria do painel na primeira mudança.

### Esc
4. Esc fecha o painel lateral. **Precedência**: se há confirmação de "apagar"
   em aberto, Esc cancela a confirmação primeiro — fechar o painel inteiro faria
   o dev perder de vista o que ia confirmar.
5. Esc no screenshot ampliado fecha **só a imagem**. O listener do lightbox é
   registrado na fase de **captura** com `stopPropagation`, vencendo o do painel
   que está atrás; sem isso, fechar a imagem fecharia o card junto.
6. O botão de fechar ganhou `title="Fechar (Esc)"` — atalho que ninguém descobre
   é atalho que não existe.

### Página inteira
7. **`app/cards/[id]/page.tsx`** (nova rota): o número do chamado no cabeçalho do
   painel virou link (com ícone de expandir) que abre o card numa **aba nova**,
   em layout de até 56rem, contra os 36rem da gaveta.
8. A página traz cabeçalho com estágio, dono da vez e idade do card, volta pro
   board, alternador de tema e **"Ver no Jira"** (montado com a URL da instância
   das configurações) — comentário e anexo que não vieram pro card estão lá.
9. As **mesmas ações** aparecem na página: quem lê ali precisa poder decidir ali.
10. O título da aba vira `SMART-XXXXX · SMART AI Flow`, pra não virar um monte
    de aba idêntica quando o dev abre vários.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `web/components/card/CardContent.tsx` | novo — conteúdo compartilhado |
| `web/components/card/CardActions.tsx` | novo — ações compartilhadas |
| `web/components/CardDetail.tsx` | reescrito: compõe os dois, Esc, link no número |
| `web/app/cards/[id]/page.tsx` | nova rota |

## Decisões
- **Extrair antes de duplicar.** A página e o painel mostram a mesma coisa em
  larguras diferentes; dois arquivos com o mesmo JSX divergiriam na primeira
  correção.
- **Aba nova, não navegação.** `target="_blank"` mantém o board vivo na aba
  anterior — o dev lê o chamado numa tela enquanto trabalha no código, que é o
  cenário descrito no pedido.
- **O número é o link.** Foi o que o pedido disse, e é o elemento que já
  identifica o chamado. No board o número não vira link porque o tile inteiro é
  um `<button>` — âncora dentro de botão é HTML inválido e quebraria o clique
  que abre o painel.
- **"Ver no Jira" é separado do link do número.** São destinos diferentes: o
  número abre o card na plataforma (com análise e diff), o botão abre o chamado
  original. Juntar os dois no mesmo clique obrigaria a escolher um.
- **Esc com precedência explícita** (lightbox → confirmação → painel). Fechar
  tudo de uma vez com uma tecla é o tipo de atalho que faz perder trabalho.

## Verificação
- `tsc --noEmit`, `eslint` e `npm run build` (web): limpos; a rota `/cards/[id]`
  aparece no build como dinâmica.
- Container `web` reconstruído; `/cards/<id>` e `/` respondem 200.
- **Não verifiquei visualmente.** Tentei abrir pelo navegador, mas a extensão do
  Chrome não está conectada. Portanto: layout da página larga, comportamento das
  três teclas Esc e o link abrindo em aba nova **não foram vistos rodando** —
  compilam e a rota responde, só isso.

## Pendências
- A página não tem o botão de apagar card (só o painel do board tem). Foi
  escolha de escopo: apagar é destrutivo e já existe no fluxo do board.
- ~~O link no número aparece só no painel lateral.~~ Resolvido em
  [2026-08-20-12](2026-08-20-12-abrir-card-em-nova-aba-pelo-board.md): o número
  do cartão no board também abre em aba nova.
