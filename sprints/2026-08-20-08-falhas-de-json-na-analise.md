# Falhas de JSON na análise (resposta cortada)

- **Data:** 2026-08-20
- **Solicitação:** "alguns chamados estão dando esse erro: Unterminated string in JSON at position 2818 / Unexpected end of JSON input. Na etapa de análise está subindo esse erro"
- **Status:** concluído
- **Cards afetados:** SMART-50927, SMART-51888 (ambos voltaram a rodar)

## Diagnóstico
Consultando `Run` no banco:

- Runs que **passaram**: 1259, 1276, 1429 tokens de saída na ANALISE — teto era **2000**.
- Runs que **falharam** registravam `0 tokens / modelo desconhecido`: o caminho de
  erro do `recordRun` não recebia o usage, então não havia evidência nenhuma.
- Os dois cards com falha eram justamente os que tinham **imagem anexada**
  (1 e 4 screenshots) — contexto maior, resposta maior.

Reprocessados depois da correção, os mesmos cards produziram:

| Card | Estágio | Saída | Teto antigo |
|---|---|---|---|
| SMART-51888 | ANALISE | 3499 tokens | 2000 |
| SMART-50927 | DESENVOLVIMENTO | 4902 tokens | 4000 |

Ou seja: **a resposta era cortada no limite de tokens** e o JSON chegava sem
fechar. Cortado no meio de uma string → "Unterminated string at position N";
cortado antes → "Unexpected end of JSON input". Não era o modelo respondendo
errado: era a plataforma pedindo menos espaço do que a resposta precisava.

## O que foi feito
1. **Tetos ajustados**: ANALISE 2000 → **4000**, DESENVOLVIMENTO 4000 → **8000**.
   Só se paga o que é gerado; o teto é limite, não consumo.
2. **`LlmResult.truncated`**: `stop_reason === 'max_tokens'` (Anthropic) e
   `finish_reason === 'length'` (OpenAI). Truncamento deixou de ser invisível.
3. **`callJsonAgent`** (`src/agents/jsonCall.ts`, novo): parseia e, se falhar,
   tenta **uma** segunda vez com o erro concreto e a resposta anterior no prompt.
   Se a primeira foi truncada, a segunda vai com o dobro de teto e instrução de
   ser mais concisa. O consumo das duas tentativas é somado na auditoria.
4. **Parser robusto** (`contracts.ts`):
   - `extractJson`: recorta o objeto balanceado, ignorando frase antes/depois e
     cerca de markdown. O `replace(/```/g)` anterior mutilava JSON cujo texto
     citava código com crase.
   - `repairJsonStrings`: escapa quebra de linha e controles **crus** dentro de
     string — inválido em JSON e comum quando o modelo cola log ou código.
   - `AgentOutputError` carrega a resposta crua e diz o que houve
     ("respondeu vazio", "fora do contrato (confidence: ...)").
5. **Evidência no `Run`**: falha de contrato grava agora a resposta do modelo
   (2000 primeiros caracteres) junto da mensagem.
6. **Modo JSON nativo da OpenAI** (`response_format: json_object`) — elimina
   cerca e frase de abertura na raiz, para quem usar esse provider.
7. **`tests/agentOutput.test.ts`** (novo): 14 casos, incluindo os dois erros
   reais relatados.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `smart-ai-flow/src/agents/jsonCall.ts` | novo — chamada com retentativa dirigida |
| `smart-ai-flow/src/agents/contracts.ts` | extractJson, repairJsonStrings, AgentOutputError |
| `smart-ai-flow/src/agents/analyzer.ts` | teto 4000 + callJsonAgent |
| `smart-ai-flow/src/agents/proposer.ts` | teto 8000 + callJsonAgent |
| `smart-ai-flow/src/infra/llm.ts` | `truncated` + modo JSON da OpenAI |
| `smart-ai-flow/src/orchestrator/orchestrator.ts` | resposta crua no Run |
| `smart-ai-flow/tests/agentOutput.test.ts` | novo |

## Decisões
- **Subir o teto é a correção; o resto é defesa.** O reparo de string e a
  retentativa cobrem o modelo escorregando na serialização, mas a causa medida
  foi o corte. Tratar só o sintoma deixaria o card falhando de novo no próximo
  chamado com screenshot.
- **Uma retentativa, com o erro no prompt.** Retry cego repetiria a mesma falha;
  o erro concreto é o que faz o modelo acertar. Duas ou mais só multiplicariam
  custo — se a segunda falha, não é ruído de formatação.
- **Reparar, não recusar.** Quebra de linha crua é erro de serialização, não de
  conteúdo: a análise dentro do JSON está correta. Jogar o card em ERRO custaria
  outra análise inteira e, pro dev, pareceria bug da plataforma.
- **Truncado não é remendado em silêncio.** JSON cortado não tem como ser
  completado com honestidade — vira erro explícito dizendo que foi corte.
- **Guardar a resposta crua na falha.** Foi a ausência disso que deixou o
  diagnóstico cego até agora.

## Verificação
- `npm test`: 8 arquivos, **59 testes** passando (14 novos).
- `npm run typecheck` e `npm run build`: limpos.
- **Ponta a ponta com o modelo real**: os dois cards relatados foram
  reprocessados pelo pipeline dentro do container e foram de **ERRO → REVISÃO**,
  com análise e proposta completas. Foi consumo real da chave da Anthropic
  (~15 mil tokens de entrada e ~14 mil de saída somando os dois).

## Pendências
- A garantia ainda é "peça JSON e valide". O passo definitivo é **saída
  estruturada nativa** (tool use forçado na Anthropic, `json_schema` na OpenAI),
  que torna resposta inválida impossível em vez de recuperável. Não fiz agora
  porque exigiria manter um JSON Schema espelhando os schemas Zod — vale se o
  erro voltar a aparecer.
- Os tetos novos (4000/8000) são folgados para o que se viu, mas continuam
  fixos. Se aparecer chamado que estoure 8000 na proposta, o retry dobra uma vez
  e depois falha explicando.
