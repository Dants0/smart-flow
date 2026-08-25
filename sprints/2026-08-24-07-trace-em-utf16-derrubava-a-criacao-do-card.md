# Trace em UTF-16 derrubava a criação do card com 500

- **Data:** 2026-08-24
- **Solicitação:** "eu tentei criar o card do SMART-51229 mas... Internal Server Error — a API está rodando?"
- **Status:** concluído — backend rebuildado, decodificação conferida contra o anexo real

## Não era a API

A API estava no ar. O log do backend tinha o erro exato:

```
PrismaClientUnknownRequestError em prisma.card.upsert()
PostgresError 22P05: unsupported Unicode escape sequence
detail: \u0000 cannot be converted to text.
```

## A causa

O anexo `pbtrace-base cliente.log` do SMART-51229 é **UTF-16LE** (BOM `FF FE`),
como todo trace do PowerBuilder. O `jiraService` lia com `buf.toString('utf-8')`:
os 6,2 MB viravam uma string com **3.111.136 caracteres NUL** intercalados —
literalmente um `\u0000` entre cada letra.

Isso quebrava duas coisas ao mesmo tempo, e só uma aparecia:

1. **Visível:** `text` e `jsonb` do Postgres não aceitam NUL, então o `upsert`
   estourava e o dev via "Internal Server Error".
2. **Invisível, e pior:** mesmo que o banco aceitasse, o que seguiria para o
   app_trace e para o prompt dos agentes seria lixo. O card teria sido criado e
   a análise sairia sobre texto corrompido.

## O que foi feito

**`src/domain/attachmentText.ts`** (novo) — `decodeAttachmentText(bytes)`:

- BOM `FF FE` → UTF-16LE; `FE FF` → UTF-16BE (Node só decodifica LE, então
  inverte os pares antes); `EF BB BF` → UTF-8 sem o BOM.
- Sem BOM, decide pelo padrão dos bytes zero numa amostra de 4 KB: em LE eles
  caem nas posições ímpares, em BE nas pares. Um terço da amostra em zeros de um
  lado só não acontece em texto de 8 bits.
- `stripNulls` no fim, sempre.

**`src/infra/cardRepository.ts`** — rede de segurança no `saveCard`: `semNul`
para as colunas de texto (`rawTicket`, `devHints`, `resolutionText`) e
`semNulJson` para as de `jsonb` (`analysis`, `proposal`, `traceAnalysis`), mais
o conteúdo de cada `traceFile`.

**9 testes** em `tests/attachmentText.test.ts` — 135 no total (era 126).

## Decisões

- **Corrigido nas duas pontas, de novo.** A origem (decodificar certo) é a
  correção; a gravação é a rede. Só a origem deixaria o próximo texto exótico —
  resposta de modelo, diagnóstico do app_trace, colagem do dev — derrubando a
  transação inteira em 500. Só a rede gravaria trace ilegível e a IA analisaria
  lixo sem ninguém perceber. Mesma lição da sprint 05.
- **`semNulJson` limpa antes de serializar, com replacer.** No JSON já
  serializado o NUL não é mais um caractere: virou a sequência escapada de seis
  letras. Procurar pelo caractere no texto serializado nunca acharia nada — foi
  o primeiro jeito que escrevi, e estava errado.
- **Heurística sem BOM, e não só BOM.** O BOM cobre o caso comum e é confiável,
  mas trace cortado ou reexportado chega sem ele — e aí o sintoma voltaria
  idêntico, num anexo diferente.

## Verificação

Mesmo anexo, mesma rota, depois do rebuild:

```
antes:  6222274 caracteres | NULs = 3111136 | "\r\u0000\n\u0000/\u0000*\u0000-\u0000..."
depois: 3111136 caracteres | NULs = 0
  | /*---------------------------------------------------*/
  | /*                 01/07/2026  15:10                 */
```

`tsc --noEmit` limpo, 135 testes passando.

## Pendências

- Continuam abertos os dois achados da sprint 06 (dispensa sem desfazer;
  Configurações aceita JQL inválida calada) e a correção nos 6 `.srw` do `mwsus`
  (SMART-50927).
