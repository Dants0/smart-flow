# Trace no proposer: a evidência de execução que só o analyzer via

- **Data:** 2026-08-24
- **Solicitação:** "hoje quando há trace presente, a IA está utilizando como contexto para resolução do chamado?" → "sim, faz, é necessário utilizar os recursos presentes para uma resolução mais assertiva possível"
- **Status:** concluído

## O que foi encontrado

O trace **entrava** na esteira, mas só até a metade:

| Onde | Usava o trace? |
|---|---|
| `orchestrator.ts:83` | sim — roda o `app_trace` antes da análise se há `traceFiles` |
| `analyzer.ts` | sim — bloco `# Diagnóstico de trace (app_trace)` no prompt |
| `chat.ts` | sim — mas com bloco próprio, sem instrução e sem contagem de eventos |
| **`proposer.ts`** | **não** — o agente que escreve o diff não recebia nada |

O proposer recebia `JSON.stringify(card.analysis)`, ou seja, a causa raiz já
*derivada* do trace — mas não o detalhe de execução: em que ponto do fluxo o
erro aparece, qual comando repete, o que roda antes do trecho a alterar.

Mesma classe de falha que os screenshots já tiveram e que foi corrigida — o
comentário em `proposer.ts:118` documenta isso: *"Os prints também vão pro
proposer... e antes só o analyzer os enxergava."* O trace tinha o mesmo
problema e não tinha sido corrigido.

## O que foi feito

1. **`domain/traceSection.ts`** — `buildTraceSection(traces, audience)`, no
   mesmo padrão de `buildSkillSection`. Um único lugar montando o bloco, com
   instrução diferente por agente.
2. **`analyzer.ts`** — bloco inline substituído pela função. Saída verificada
   **byte a byte idêntica** à anterior: a refatoração não muda comportamento.
3. **`proposer.ts`** — bloco anexado ao prompt, logo após a análise e antes do
   código real.
4. **`chat.ts` unificado** — era a terceira cópia solta do bloco. Passou a usar
   o builder com o público `'chat'`, ganhando a instrução que não tinha e a
   contagem de eventos que omitia.
5. **12 testes** em `tests/traceSection.test.ts` (114 no total, era 102).
6. `CLAUDE.md` atualizado (estrutura + contagem de testes, que estava em 86).

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/domain/traceSection.ts` | novo — builder compartilhado do bloco de trace |
| `src/agents/analyzer.ts` | usa o builder (`'analise'`); saída inalterada |
| `src/agents/proposer.ts` | passa a receber o trace (`'proposta'`) |
| `src/agents/chat.ts` | usa o builder (`'chat'`) no lugar do bloco próprio |
| `tests/traceSection.test.ts` | novo — 12 testes |
| `CLAUDE.md` | estrutura de `domain/` + contagem de testes |

## Decisões

- **Instrução diferente por agente, mesmo material.** O analyzer ainda está
  decidindo a causa raiz, então lá o trace é "evidência a cruzar antes de
  fechar". O proposer recebe a causa raiz já validada, então lá a instrução é
  explícita: *não reabra a causa raiz*; use o trace para os detalhes que mudam
  o diff. Sem isso, o proposer tenderia a rediscutir a análise que o dev já
  leu, e o diff sairia contra uma teoria diferente da apresentada.
- **Contradição vai para `risks`, não para o diff.** Se o trace contradiz a
  análise, o proposer declara em `risks` em vez de propor contra a evidência de
  execução — mantém o dev no controle da decisão.
- **Custo baixo.** O que entra no prompt é o `strategicAnalysis` do app_trace
  (SQL normalizado, execuções agrupadas por hash, médias, severidade), não o
  log bruto — que pode ter gigabytes.
- **Função compartilhada em vez de copiar o bloco.** Duas cópias do texto foi
  exatamente o que deixou o proposer de fora sem ninguém notar.

## Pendências

Continuam abertas das sprints anteriores:

- Aplicar a correção nos 6 `.srw` do `mwsus` (SMART-50927), em branch própria.
- Rebuild do container do pb-insight para o endpoint `/siblings` valer no
  ambiente rodando — o mesmo rebuild vale para esta mudança no backend.
