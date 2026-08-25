# Abrangência do diagnóstico: achar as janelas irmãs com o mesmo defeito

- **Data:** 2026-08-24
- **Solicitação:** "essa mesma alteração feita em somente 1 das Windows deveria ser replicada nas outras Windows... Porque o claude do terminal dele conseguiu e você não conseguiu? preciso de soluções completas nos chamados"
- **Status:** concluído (pb-insight) / a correção nos 6 `.srw` ficou pendente por decisão do usuário

## Contexto

No chamado SMART-50927 (paciente com status Óbito: responder "Não" no alerta
avança do mesmo jeito) o pb-insight diagnosticou **1** janela quando **6**
tinham o mesmo defeito. O tech lead rodou o mesmo chamado num Claude Code com
o repositório inteiro e achou as demais com `grep`.

## O que foi feito

1. **Varredura independente do ws_objects** para estabelecer a verdade do
   caso: 47 overrides de `avancar` em controles `u_dw_pac*`; 15 já aplicam a
   guarda `i_bAvancar`, 4 têm corpo trivial, **28 têm o defeito** — 7 no
   `mwsus` (6 abríveis pelo menu de `m_principal.srm`, 1 objeto morto).
   Confirmado que os nomes `w_sicolo_*` citados pelo tech lead não existem
   (são `w_siscolo_*`) e que a lista de 4 dele deixava 2 janelas de fora.
2. **Diagnóstico da causa no pb-insight**: `prepare()` ancora o contexto num
   único objeto (raiz + ancestrais + 1 salto de `embeds`/`references`), e
   janelas irmãs não têm aresta entre si — nunca entravam no dump. O prompt
   também não pedia escopo.
3. **`FindPatternSiblingsUseCase`** — acha todas as ocorrências do mesmo
   evento em controles do mesmo tipo (e descendentes por herança) no
   ws_objects, direto do snapshot, sem reler fonte.
4. **Integração no `DiagnoseTicketUseCase`** — `PrepareOptions`
   (`maxSiblings`, `siblingBodyChars`), bloco
   `--- OUTRAS OCORRÊNCIAS DO MESMO EVENTO ---` no `objectContext`, campos
   `siblings` / `siblingsTruncated` na preparação.
5. **Seção `Abrangência:` no prompt**, condicional a `siblingCount > 0`.
6. **CLI (`--max-siblings`, listagem no `--dry-run`) e `POST /diagnose`**
   (`maxSiblings` no body, `context.siblings[]` na resposta).
7. **Validação contra o grafo real**, que expôs dois defeitos invisíveis nos
   testes sintéticos: irmãs duplicadas e o teto cortando justamente o módulo
   do chamado. Ambos corrigidos e cobertos por teste.
8. **`GET /objects/:name/events/:eventName/siblings`** — o mesmo levantamento
   como endpoint, porque a esteira **não usa** o `POST /diagnose`: ela monta o
   contexto por conta própria (`/search` + `/objects/.../events/...`) e roda
   `analyzer`/`proposer` com prompt próprio. Sem o endpoint, o conserto não
   chegaria ao caminho que atendeu o SMART-50927.
9. **Esteira ligada ao endpoint** — `retrieveContext()` busca as irmãs de cada
   evento que entra no contexto e monta a seção "Mesmo evento em outros
   objetos (abrangência)" (teto global de 12, 1500 chars cada, best-effort).
10. **Regras nos agentes** — `analyzer` obrigado a listar em `affectedObjects`
    todos os objetos com o defeito; `proposer` orientado de que "cirúrgico" é
    o tamanho do hunk, não o número de arquivos.
11. **Verificação com o servidor no ar** sobre o grafo real: o endpoint
    devolveu as 7 ocorrências do `mwsus` no topo, com `w_apac` (a que já tem a
    guarda) separável das 6 defeituosas pelo corpo do evento.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `pb-insight/src/application/use-cases/find-pattern-siblings/find-pattern-siblings.use-case.ts` | novo — busca de ocorrências irmãs por tipo de controle + evento |
| `pb-insight/src/application/use-cases/diagnose-ticket/diagnose-ticket.use-case.ts` | `PrepareOptions`, bloco de abrangência no dump, `siblings`/`siblingsTruncated`, `siblingCount` ao LLM |
| `pb-insight/src/application/ports/llm-client.port.ts` | `siblingCount` em `DiagnosticContext` |
| `pb-insight/src/infrastructure/llm/diagnosis-prompt.ts` | seção `Abrangência:` condicional |
| `pb-insight/src/interfaces/cli/diagnose.command.ts` | `--max-siblings` + listagem das irmãs |
| `pb-insight/src/interfaces/http/routes/diagnose.route.ts` | `maxSiblings` no body, `siblings[]` na resposta |
| `pb-insight/src/interfaces/http/routes/objects.route.ts` | novo `GET /objects/:name/events/:eventName/siblings` |
| `pb-insight/docs/05-api-http.md` | endpoint novo na tabela da API |
| `smart-ai-flow/src/infra/pbInsight.ts` | `collectSiblings()` + seção "Mesmo evento em outros objetos (abrangência)" no contexto |
| `smart-ai-flow/src/agents/analyzer.ts` | regra: `affectedObjects` cobre todos os objetos com o defeito |
| `smart-ai-flow/src/agents/proposer.ts` | regra: cirúrgico é o tamanho do hunk, não o número de arquivos |
| `pb-insight/tests/http/server.test.ts` | fixture com janela irmã + 5 testes do endpoint |
| `pb-insight/tests/use-cases/find-pattern-siblings.test.ts` | novo — 8 testes |
| `pb-insight/tests/use-cases/diagnose-ticket.test.ts` | +6 testes do bloco de abrangência |
| `pb-insight/tests/infrastructure/diagnosis-prompt.test.ts` | +4 testes da seção Abrangência |
| `pb-insight/docs/16-abrangencia-do-diagnostico.md` | novo |

## Decisões

- **Busca por tipo de controle, não por nome.** `dw_pac01tab` é convenção; as
  mesmas telas usam `dw_pac01`, `dw_pac01ff`, `dw_pac`. Inclui descendentes
  por herança (`u_dw_pac_assist`), senão um objeto com o mesmo defeito ficaria
  de fora por usar uma especialização.
- **Só com `eventFocus`.** Sem um evento em foco não existe "mesmo evento" a
  comparar; anexar irmãs num dump de objeto inteiro seria ruído.
- **Ordem: mesma PBL primeiro.** Ordenar por id e cortar em 40 descartava todo
  o `mwsus` no caso real. "Mesma biblioteca" é o proxy mais direto de "mesmo
  módulo", que é o que precisa sobreviver ao corte.
- **Corte do corpo pelo fim** (2000 chars): a guarda que separa "já corrigida"
  de "com o defeito" é sempre cláusula de entrada do evento.
- **Prompt proíbe extrapolar** para arquivos ausentes do contexto — pedir
  abrangência sem material para comparar convidaria o modelo a inventar
  arquivos, que é o oposto do grounding do docs/03.

## Pendências

- A correção nos 6 `.srw` do `mwsus` (`IF not This.i_bavancar THEN RETURN`,
  padrão de `w_apac.srw:7779`) **não foi aplicada**: o usuário optou por fazer
  primeiro o ajuste no pb-insight. O working tree de `smart_desktop` está na
  branch `bug/SMART-51811_B` com `.pbl` modificados de outro chamado, então a
  aplicação pede branch própria (`bug/SMART-50927`) a partir da `main`.
- Os outros **21 objetos com o mesmo defeito** fora do `mwsus` (ver docs/16)
  não foram avaliados — só levantados. Cada um precisa de análise própria
  antes de virar mudança.
- O bloco de abrangência cobre padrão "mesmo evento, mesmo tipo de controle".
  Defeitos replicados por outro eixo (mesma função chamada de N lugares, mesma
  DataWindow) continuam fora.
