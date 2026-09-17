# Custo de tokens com duas casas, truncado

- **Data:** 2026-09-17
- **Solicitação:** "truncar o valor gasto dos tokens, 14.8913, deve ser 14.89"
- **Status:** concluído

## O que foi feito
- Novo `web/lib/money.ts` com `formatUsd`: duas casas, **truncado** (não arredondado).
- Monitor de Recursos → Consumo de IA usa `formatUsd` no custo total e no custo
  por modelo (antes era `toFixed(4)`).

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `web/lib/money.ts` | novo — `formatUsd` |
| `web/app/settings/resources/page.tsx` | custo total e por modelo com duas casas |

## Decisões
- **Truncar, como pedido**, e não arredondar: o valor é estimativa, e mostrar
  centavo a mais do que foi gasto contradiz a fatura.
- **Correção de ponto flutuante** (`+ 1e-9` antes do `floor`): sem ela, 14.29
  apareceria como 14.28.
- Só a exibição mudou; o backend continua guardando e devolvendo o valor completo.

## Verificação
- `tsc --noEmit` e `eslint` limpos no web.
- Conferido: 14.8913 → $14.89 · 14.29 → $14.29 · 1.999 → $1.99 · 0.0049 → $0.00.

## Pendências
- Gasto abaixo de 1 centavo aparece como `$0.00`. Consequência direta de
  truncar em duas casas.
- Reconstruir o container `web` para valer.
