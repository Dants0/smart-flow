# 03 — Motor de diagnóstico e validação honesta da hipótese de grounding

> Entregue em 2026-07-24. Cobre o passo 7 do SPEC §13 (motor de diagnóstico
> orquestrado) na forma mínima viável — sem RAG de tickets (passos 5–6 ainda
> não existem) — e uma validação real, com resultado que **não confirma** a
> hipótese simples que motivou o grafo. Documentado porque o resultado é
> nuançado e importa para não repetir o mesmo experimento esperando outro
> resultado.

## O que existe e funciona

`npm run diagnose -- <objeto> --ticket <arquivo> [--relations a,b] [--dry-run]`
monta o contexto (objeto + ancestrais + `embeds`/`references` de 1 salto),
concatena os fontes e chama o Claude (`claude-opus-4-8`, `thinking: adaptive`)
com o mesmo template de 4 campos validado no teste-minimo (Causa raiz /
Correção sugerida / Evidência / Confiança).

```
src/application/ports/llm-client.port.ts          ILLMClient, DiagnosticContext, DiagnosisOutput
src/application/use-cases/diagnose-ticket/         prepare() [I/O sem LLM] + diagnose() [chama o LLM]
src/infrastructure/llm/diagnosis-prompt.ts         função pura, testável sem rede
src/infrastructure/llm/claude-diagnostic-client.ts adapter real via @anthropic-ai/sdk
src/interfaces/cli/diagnose.command.ts             CLI, --dry-run para orçar custo antes de gastar
```

`prepare()`/`diagnose()` são separados de propósito: `prepare()` só faz
I/O de grafo e filesystem (sem chamar a API), o que permite o `--dry-run`
mostrar tamanho e lista de objetos do contexto sem gastar um único token.

### Por que o contexto padrão exclui `opens` e `function_call`

Medido contra o repo real: `w_confirm_agm` tem 80 relacionados de 1 salto (4
embeds, 14 references, 25 opens, ~40 function_call). Dumpar tudo custaria
dezenas de MB de contexto. O padrão inclui só ancestrais + `embeds` +
`references` (20 objetos, 884 KB, ~226K tokens no teste real) — exatamente o
que fechou a lacuna no experimento do teste-minimo (o modelo pediu
`w_sheet_gen` e `u_datawindow_padrao`, não as 25 janelas de navegação nem as
~40 funções utilitárias genéricas). `--relations all` ou `--relations
opens,function_call` opta pelo resto quando a natureza do bug for de
navegação, não de renderização/estado.

## Validação real: SMART-51352 (zoom da w_confirm_agm), com grafo completo

Metodologia (sem tocar `C:\controle de versão` além de leitura): script
descartável (`scripts/build-validation-fixture.ts`) monta um fixture isolado
em `.data/validation-fixture/` copiando os 20 objetos de contexto reais do
`ws_objects` **por leitura**, e substitui só o `w_confirm_agm.srw` pela
versão com o bug reintroduzido (já preparada em `teste-minimo/input/objeto.txt`
desde a sessão anterior). Ingestão e diagnóstico rodam contra esse fixture
isolado, não contra o repositório de trabalho do usuário.

**Resultado: o modelo NÃO convergiu para a causa raiz confirmada pelo fix**
(mover `This.ScrollToRow(nSelRow)` para fora do `IF NOT isnull(nAgmGSerie)`,
após o `GroupCalc()`, dentro do evento `zoom`). Em vez disso, propôs uma
hipótese diferente: `getfocus` reseta o filtro (`This.setFilter("");
This.Filter()`), `retrieveend` força `This.setRow(1)` ao final, e `clicked`
só reafirma a linha selecionada quando um checkbox está marcado.

**Verificação independente:** conferi os três trechos citados linha a linha
no fixture — **os três são reais e citados corretamente** (linhas 1144-1145,
2092, 2095-2097 do `w_confirm_agm.srw`, todos dentro do mesmo bloco de
eventos de `dw_agm18tab`). Não é alucinação de código — é uma teoria causal
diferente, mecanicamente plausível, construída sobre evidência real, mas que
não é o que o fix de fato corrigiu.

### A reinterpretação que isso força

O achado mais importante não é "o modelo errou de novo" — é **por quê**: o
trecho correto (`GroupCalc()` + `ScrollToRow` dentro do `IF`) já estava
presente no contexto da *rodada 2* do teste-minimo, que usou **só o objeto
raiz, sem grafo nenhum**. Ou seja, a causa raiz real nunca dependeu de
contexto ausente — ela sempre esteve disponível, só dentro de um evento
`zoom` de ~250 linhas competindo com dezenas de outros eventos no mesmo
arquivo de 148KB. Adicionar ancestrais e DataWindows (mais ~700KB de texto)
não corrigiu isso — dobrou o palheiro e o modelo achou uma agulha real, porém
errada, em outro lugar.

Isso **não invalida** a decisão de construir o grafo (UI-string index,
diff de versão e o próprio contexto de ancestrais continuam tendo valor
demonstrado — ex.: `search "Período"` → `d_lmc02tab`), mas invalida a
hipótese específica de que "mais objetos relacionados = melhor diagnóstico"
para este tipo de bug. O gargalo real, neste caso, é **granularidade**: o
objeto inteiro é a unidade de contexto; o evento/método é a unidade que
importa.

### Próximo passo indicado por este resultado

Extrair e indexar eventos/funções individualmente (não só o objeto inteiro),
para poder alimentar o LLM com "o evento `zoom` de `dw_agm18tab`" (250 linhas)
em vez de "o `w_confirm_agm.srw` inteiro" (148KB, ~40 eventos). Isso é
naturalmente o início da camada de AST (SPEC §13.8) — antes cogitada como
"sob demanda", agora com evidência concreta de que resolve um problema real
de diagnóstico, não é só refinamento acadêmico do parser.

## Custo real observado

| Config | Objetos | Tamanho | Tokens (real) | Custo (Opus 4.8) |
|---|---|---|---|---|
| root + ancestrais + embeds/references (default, hops=1) | 20 | 884 KB | 444.261 in / 11.968 out | ~US$ 2,52 |

Caro para uso recorrente sem RAG de tickets similares para pré-filtrar. Reforça
que granularidade de contexto (evento, não objeto) também é alavanca de custo,
não só de qualidade.

## Decisões registradas

1. **`prepare()`/`diagnose()` separados** — permite orçar antes de gastar
   (`--dry-run`), e torna `prepare()` testável sem rede.
2. **`claude-opus-4-8` como modelo padrão** (não `claude-sonnet-5`, usado no
   teste-minimo). Escolha deliberada: esta é a peça "de produção" do projeto,
   e a diretriz de modelo padrão pede Opus salvo pedido explícito em
   contrário; o teste-minimo foi um experimento anterior já validado, não
   refeito.
3. **Validação via fixture isolado, nunca editando `ws_objects` real** — a
   regra "nunca rodar git em `C:\controle de versão`" foi respeitada, e por
   cautela adicional nem sequer arquivos foram sobrescritos ali (só lidos);
   toda escrita ficou em `pb-insight/.data/`.
4. **Reportar o resultado como está, não como se esperava.** O experimento
   testava uma hipótese específica (mais contexto fecha a lacuna) e ela não
   se confirmou neste caso. Documentar isso é mais valioso do que só
   documentar sucessos — é o mesmo princípio de calibração de confiança que
   o próprio SPEC pede do motor de diagnóstico, aplicado à condução do
   projeto.

## Limitações conhecidas

- Um único caso de validação (n=1). Não dá para concluir que grafo de
  objetos nunca ajuda — só que, neste caso específico, não ajudou e o motivo
  aparente é granularidade, não ausência de dado.
- Sem RAG de tickets similares e sem detecção de regressão de versão
  integrados ao `diagnose` ainda — o comando de hoje é estritamente "código +
  chamado", sem o "tickets parecidos" nem o "o que mudou entre versões" que
  o SPEC §9 desenha.
- `scripts/build-validation-fixture.ts` é específico deste ticket (caminhos
  hardcoded) — serve como registro de metodologia reproduzível, não como
  ferramenta genérica de validação para outros casos.

## Próximos passos

- Extração de eventos/funções individuais como unidade de conteúdo indexável
  (motivado diretamente pelo achado acima).
- Rodar o mesmo `diagnose` em 2-3 outros chamados já resolvidos (conforme
  combinado desde o início) antes de tirar qualquer conclusão mais ampla —
  este documento é evidência de 1 caso, não veredito.
