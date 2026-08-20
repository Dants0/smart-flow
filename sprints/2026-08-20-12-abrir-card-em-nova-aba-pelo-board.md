# Abrir o card em nova aba direto do board

- **Data:** 2026-08-20
- **Solicitação:** "no card em si já deve permitir abrir na próxima aba. Atualmente eu preciso abrir o card para poder fazer isso"
- **Status:** concluído

## O que foi feito
1. **`components/CardTile.tsx`**: o número do chamado no cartão do board virou
   link para `/cards/<id>` com `target="_blank"` e o mesmo ícone de expandir do
   painel — o dev abre o chamado inteiro sem precisar abrir a gaveta antes.
2. O cartão deixou de ser `<button>` e passou a ser
   `<div role="button" tabIndex={0}>`, com `onKeyDown` tratando **Enter** e
   **Espaço** para o teclado continuar funcionando como antes.
3. `stopPropagation` no clique do link: sem isso, clicar no número abriria a aba
   nova **e** o painel lateral atrás dela.
4. Anel de foco explícito (`focus-visible:ring-2`), que o `<button>` dava de graça.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `web/components/CardTile.tsx` | número vira link; tile vira div com role/teclado |

## Decisões
- **Trocar `<button>` por `div role="button"` foi obrigatório, não estilo.**
  Âncora dentro de botão é HTML inválido: o navegador desmonta a marcação e o
  clique passa a se comportar de um jeito diferente em cada engine. Com a div, os
  dois alvos convivem de forma previsível.
- **Link de verdade, não `window.open`.** Só assim funcionam clique do meio,
  Ctrl+clique, "abrir em nova aba" do menu de contexto e "copiar endereço" —
  que é o que um dev espera de um número de chamado.
- **O resto do cartão continua abrindo o painel.** A leitura rápida sem sair do
  board segue sendo o caminho principal; a aba nova é para quando o chamado é
  grande.
- **Teclado preservado explicitamente.** Trocar botão por div silenciosamente
  quebraria navegação por Tab+Enter, que hoje funciona.

## Verificação
- `tsc --noEmit`, `eslint` e `npm run build` (web): limpos.
- Container `web` reconstruído; board respondendo 200.
- **Não verifiquei visualmente** — a extensão do Chrome continua desconectada.
  Comportamento do clique (número → aba nova; resto → painel) e o foco por
  teclado não foram vistos rodando.

## Pendências
- Nenhuma. Isto encerra a pendência aberta em
  [2026-08-20-11](2026-08-20-11-esc-e-pagina-inteira-do-card.md).
