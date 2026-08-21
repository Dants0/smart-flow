# Guardas contra proposta inventada (SMART-50927)

- **Data:** 2026-08-21
- **Solicitação:** crítica ao card SMART-50927 — "sua sugestão não está correta, você decidiu seguir por um caminho que não tinha provas suficientes para assumir... acabou imaginando uma função sem ela sequer existir"
- **Status:** concluído

## O que a plataforma errou
Conferido no repositório real:

| O que a IA propôs | Realidade |
|---|---|
| `MWSUS50/mwsus50.pbl.src/f_valida_obito_paciente.srf` | **não existe** — função e arquivo inventados |
| `MWSUS50/mwsus50.pbl.src/w_aih_emissao.srw` | não existe; o real é `ws_objects/mwsus/mwsus.pbl.src/w_lea_aih.srw` |
| evento `ue_valida_paciente` | inventado; o real é `avancar`, sobrescrito do `u_dw_pac` |
| layout `MWSUS50/mwsus50.pbl.src/` | o repo usa `ws_objects/<lib>/<lib>.pbl.src/` |

**Os 5 caminhos do diff eram fictícios.** A causa real: `uof_testar_status()` em
`u_dw_pac.sru` seta `i_bAvancar = FALSE`, e as 4 telas chamam
`call super::avancar` sem checar a flag — padrão já usado em **19** outros
objetos do sistema (conferido com `git grep -il i_bAvancar`).

Três defeitos da plataforma, não do modelo:

1. **O pipeline ignorava o próprio aviso.** A análise dizia "pede um pbtrace
   antes de propor o diff" (`needsTrace: true`) e o orquestrador seguia direto
   pra DESENVOLVIMENTO.
2. **Nada conferia se os caminhos existiam**, embora o repositório esteja
   montado no backend.
3. **O prompt pedia "caminhos reais" sem fornecer nenhum** — o modelo deduzia o
   layout de pasta a partir do nome do módulo.

## O que foi feito
1. **`infra/objectIndex.ts`** (novo): índice de `git ls-files` (~16 mil arquivos,
   cache de 5 min) com `resolveObjectPaths()`, `unknownDiffPaths()` e
   `searchObjects()`. Sem repositório acessível, tudo vira no-op.
2. **Proposer recebe os caminhos reais**: os objetos da análise são resolvidos
   contra o índice e entram no prompt como "Arquivos reais (caminhos conferidos
   no repositório)". Se nenhum for encontrado, a instrução é explícita: devolver
   diff vazio e dizer o que falta buscar.
3. **Regra nova no system prompt**: nunca inventar caminho, função, evento ou
   objeto — "diff contra arquivo inexistente é pior que nenhum diff".
4. **Conferência determinística depois**: todo caminho do diff é validado contra
   o índice; o que não existe vira `Card.unknownPaths` (migração
   `20260821090000_unknown_paths`).
5. **Aviso na UI, antes do diff**: banner vermelho listando os caminhos
   inexistentes — "trate o diff como hipótese, não como correção".
6. **`needsTrace` passou a valer**: análise que pede pbtrace e não tem trace
   anexado para em REVISÃO com a análise, **sem propor diff**. Exigiu abrir a
   transição `ANALISE → REVISAO`.
7. **Briefing aprendeu o caso**: `modules/smartdesktop/CLAUDE.md` ganhou o layout
   real de pastas e a seção do fluxo `avancar`/`i_bAvancar`/`uof_testar_status`,
   com o exemplo de código correto.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/src/infra/objectIndex.ts` | novo |
| `smart-ai-flow/src/agents/proposer.ts` | caminhos reais no prompt + verificação |
| `smart-ai-flow/src/orchestrator/orchestrator.ts` | honra `needsTrace`, guarda `unknownPaths` |
| `smart-ai-flow/src/domain/stages.ts` | transição `ANALISE → REVISAO` |
| `smart-ai-flow/prisma/schema.prisma` + migração | `Card.unknownPaths` |
| `smart-ai-flow/modules/smartdesktop/CLAUDE.md` | layout real + padrão `i_bAvancar` |
| `smart-ai-flow/src/domain/card.ts`, `infra/cardRepository.ts` | campo novo |
| `web/components/card/CardContent.tsx`, `lib/types.ts` | aviso de caminho inexistente |
| `smart-ai-flow/tests/stages.test.ts`, `tests/versioning.test.ts` | transição nova |

## Decisões
- **Dar o caminho certo vale mais que proibir o errado.** A regra no prompt
  ajuda, mas o que realmente resolve é o modelo receber
  `ws_objects/mwsus/mwsus.pbl.src/w_lea_aih.srw` em vez de deduzir pasta.
- **Conferência determinística, não confiança no modelo.** O índice é `git
  ls-files`: ou o arquivo está rastreado, ou não está. Nenhum julgamento.
- **Avisar, não bloquear.** Caminho inventado não manda o card pra ERRO: a
  análise pode estar parcialmente certa. O que muda é o card parar de parecer
  uma correção pronta.
- **`needsTrace` era um campo decorativo.** O modelo já sabia que faltava
  evidência; quem ignorou foi a esteira.
- **O caso virou linha no briefing**, como o próprio arquivo pede — o padrão
  `i_bAvancar` afeta todas as telas que sobrescrevem `avancar`, não só estas 4.

## Verificação
- `npm test`: 9 arquivos, **82 testes**, todos passando.
- Um teste que eu tinha escrito **pegou um erro meu**: `ANALISE → REVISAO` não
  existia na máquina de estados, então a parada por falta de trace mandaria o
  card pra ERRO. Corrigido antes de subir.
- `typecheck`, `eslint` e `build` (web) limpos.
- Conferência manual no repositório: os 5 caminhos do diff do SMART-50927 não
  existem; `u_dw_pac.sru`, `w_lea_aih.srw` e `w_sismama_mamografia.srw` existem
  nos caminhos que o índice devolve.
- **Não reprocessei o SMART-50927** com as guardas ligadas — o card está em
  REVISÃO com o diff antigo, e reprocessar é decisão sua (custa tokens e
  sobrescreve a análise atual).

## Pendências
- As guardas reduzem invenção de **caminho**; não impedem o modelo de errar a
  **lógica** dentro de um arquivo que existe. A defesa contra isso continua
  sendo o dev revisar o diff.
- O RAG do PB Insight não trouxe o código de `u_dw_pac` nesta análise. Melhorar
  a recuperação (buscar pelo ancestral, não só pelos objetos citados no chamado)
  é o próximo passo natural — e maior que este.
