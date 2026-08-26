# A venda da análise: o post-mortem do 51229 vira regra da esteira

- **Data:** 2026-08-25
- **Solicitação:** "esse documento contém o caminho que outra IA integrada ao terminal seguiu para resolver um chamado que você não conseguiu 'por falta de informação'. Atualize os CLAUDE.md, reveja as regras que atualmente colocam uma venda na sua análise e propostas."
- **Status:** concluído — 156 testes, `tsc` limpo

## O diagnóstico do documento, conferido contra o código

O post-mortem lista cinco falhas do agente do kanban. Conferindo cada uma contra
a esteira que roda hoje, três já estavam resolvidas e **duas eram reais**:

| Crítica | Situação real |
|---|---|
| "RAG não pode ser o único acesso ao código" | Já resolvido na sprint 2026-08-25-01: `sourceExcerpts.ts` faz `git show` e `git grep` no checkout — **mas só no estágio de PROPOSTA** |
| "Pediu ao dev código que estava no repositório" | Nenhuma regra proibia isso explicitamente |
| "Fixou-se na primeira hipótese / cadeia de chamada" | Nada no prompt exigia fechar a cadeia até o pixel |
| "Nunca perguntou quem mais usa isso" | Não existia inventário de reuso |
| "Não mediu o raio de alcance" | Não existia regra de split de chamado |

A venda de verdade estava numa linha só: **o analyzer nunca via o repositório.**
`runAnalysis` chamava `retrieveContext` (RAG do PB Insight) e mais nada. Quem
monta a cadeia de chamada é a análise — e ela trabalhava com busca semântica
pura, que traz o parecido e erra o idêntico. No 51229 a causa final morava em
`font_color.srf`, uma função global que nenhuma busca por "instruções cortadas
na agenda" traria. O agente ficou preso em propriedade de controle porque era a
única coisa que ele conseguia enxergar.

E havia uma segunda linha, no prompt do analyzer, que fechava a saída:

> "Cite em affectedObjects apenas objetos que apareceram no contexto de código."

`affectedObjects` é exatamente a lista que o `objectIndex` resolve e o
`gatherSourceMaterial` lê. Proibir o modelo de nomear um objeto suspeito
proibia a plataforma de **ir buscar o arquivo certo** — nome inexistente é
descartado em silêncio pelo índice, então a regra não protegia de nada e custava
o chamado.

## O que foi feito

**1. A análise passa a ler o repositório** (`agents/analyzer.ts`). Antes do
prompt, `gatherSourceMaterial` roda com o texto do chamado e do dev, abrindo os
fontes por identificador PowerBuilder, literal de tela entre aspas e ancestral
declarado.

**2. Orçamento por estágio** (`infra/sourceExcerpts.ts`). Os dois estágios
precisam de coisas opostas, e agora dizem isso no código:

| | análise (largura) | proposta (profundidade) |
|---|---|---|
| arquivos | 14 | 10 |
| por arquivo | 32.000 | 96.000 |
| total | 140.000 | 240.000 |

A cadeia atravessa objetos (`evento → função → OpenWithParm → open → f_global`),
então a análise precisa de mais arquivos; o diff precisa do bloco inteiro, então
a proposta precisa de mais de cada um.

**3. Inventário de reuso** (`reuseInventory` / `formatReuseInventory`). Para cada
objeto lido, `git grep -l -w` devolve **quem mais o cita** — lista de caminhos,
sem código, algumas centenas de tokens. Entra nos dois prompts e responde as duas
perguntas do passo 4 do protocolo: *quem me chama* (mais de um ponto de entrada
= todos entram no diff) e *quem mais usa o que eu vou alterar* (objeto
compartilhado = alteração condicional). É o que separa "corrigi `w_agd03`" de
"corrigi `w_agd03` e esqueci `m_sheet.mf_buscar_agds`".

**4. Prompt do analyzer, reescrito.** Ganhou:

- **A regra que vale mais que as outras:** não se pergunta ao dev nada que esteja
  em arquivo versionado. A lista de perguntas proibidas ("me cola a seção X do
  `.srd`", "qual janela abre esse pop-up") e a das permitidas (intenção,
  ambiente, estado do `.pbl`) estão no prompt, com a heurística: pergunta sobre
  **código** é proibida, sobre **intenção/ambiente** é permitida.
- **Protocolo de cinco passos**, com saída marcada em `reasoning`: `CADEIA:`,
  `REUSO:`, `ESCOPO:`, `PERGUNTA AO DEV:`. A investigação só termina quando o
  último elo da cadeia é uma linha que altera aparência ou conteúdo — enquanto
  for "popula um datastore", falta cadeia.
- **"Texto cortado" nunca é uma hipótese, são três camadas** — gravação, leitura,
  exibição. Propriedade de controle é a última coisa a investigar.
- **`affectedObjects` é lista de BUSCA**, não só de culpados: objeto suspeito
  entra marcado com "HIPÓTESE — buscar ...".

**5. Prompt do proposer.** Ganhou reuso (pontos de entrada + objeto
compartilhado com alteração condicional), raio de alcance com split explícito de
chamado, regressão visual como requisito, e as armadilhas de compilação do
PowerBuilder que produzem proposta que não compila (shared variable é escopo de
classe; variável de instância não serve com `OpenWithParm` em `response!`; dois
valores num `OpenWithParm` exigem marcador ou estrutura global — e essa escolha
é do dev; acento direto no fonte corrompe o arquivo).

**6. CLAUDE.md.**

- `modules/smartdesktop/CLAUDE.md`: mapa dos objetos compartilhados com quem usa
  cada um; `.srf` e `.srm` contam como fonte (as duas peças que faltaram no 51229
  eram uma função global e um menu); o `.pbl` é o que roda, então o fechamento
  declara estado **por artefato**; o que nunca entra numa proposta (`UPDATE`/
  `DELETE`, SQL novo sem aviso, mudança visual não pedida); as duas pendências
  conhecidas com raio medido.
- `modules/agenda/CLAUDE.md`: o 51229 inteiro — as três camadas, a cadeia até o
  pixel, os dois pontos de entrada da agenda, `w_exibe_inst` compartilhada com o
  Lab, e as tabelas `smk` × `smkinst`.
- `modules/smartweb/CLAUDE.md`: as três camadas do truncamento e as armadilhas de
  compilação, que valem igual no web.
- `CLAUDE.md` do backend: **onde mora cada regra** — método no system prompt,
  fato de plataforma no CLAUDE.md do sistema, fato de módulo no do módulo, método
  do time na skill. Com o custo de cada um anotado, porque
  `loadModuleContext('smartdesktop')` concatena seis briefings em todo prompt.

5 testes novos — 156 no total (era 151).

## Decisões

- **A hierarquia importa mais que o volume.** O documento sugere um CLAUDE.md
  raiz de ≤40 linhas com playbooks sob demanda. Adotada a ideia, não a forma: o
  que dilui não é o tamanho, é misturar método com fato. Método foi pro system
  prompt (uma cópia, vale pros dois sistemas); fato ficou no CLAUDE.md.
- **Número redondo virou regra de prompt, não grep automático.** O `MID(...,1,2000)`
  foi achado grepando `\b2000\b`. Automatizar isso traria data, versão e número
  de chamado junto — noise que rouba orçamento de quem tem o código. O modelo
  agora é instruído a **nomear** o número e o objeto onde procurá-lo.
- **Inventário é lista de caminhos, sem código.** O que muda a proposta é saber
  que existe outro consumidor, não ler o corpo dele.
- **`grounded` passou a considerar o repositório.** Marcar "análise sem código"
  só porque o pb-insight estava fora do ar seria mentira na direção contrária.

## Pendências

- **Reprocessar o SMART-51229** com a esteira nova e comparar com a solução real
  (herdada da sprint anterior — agora com o que testar de fato).
- **Chunking do PB Insight** (item 6.2 do documento): indexar por `objeto::função`
  em vez de offset, e indexar `.srf`/`.srm` com o mesmo peso das janelas. É
  projeto separado (`pb-insight/`) e não foi tocado aqui — o acesso direto ao
  repositório reduz o dano, mas não substitui o índice.
- **Custo por card subiu**: a análise agora paga até ~38 mil tokens de entrada de
  material. Vale medir em `Run` depois de alguns chamados e calibrar
  `ANALYZER_BUDGET` com número real.
- Pendências antigas seguem: dispensa do banner sem desfazer (sprint 06),
  `@default` da JQL (sprint 10), 6 `.srw` do `mwsus` (SMART-50927).
