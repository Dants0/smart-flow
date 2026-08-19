# 06 — Multi-provedor (Claude + GPT) e controle de custo

> Entregue em 2026-07-24, em resposta direta a um problema real: o motor de
> diagnóstico (docs/03-05) usava `claude-opus-4-8` como modelo default sem
> deixar isso óbvio antes da chamada, gerando gasto real maior do que o
> necessário. Esta entrada corrige o default e adiciona GPT como alternativa.

## O que mudou

1. **Modelo default do Claude trocado de `claude-opus-4-8` para
   `claude-sonnet-5`** — não o mais barato do catálogo, mas o que já tinha
   qualidade validada no teste-minimo, a uma fração do custo do Opus.
2. **Integração com OpenAI/GPT adicionada** — `OpenAIDiagnosticClient`
   implementa o mesmo `ILLMClient`, default `gpt-4o-mini` (barato).
3. **Provedor/modelo agora são escolha explícita, não fixados no código** —
   CLI (`--provider`/`--model`), API HTTP (`provider`/`model` no corpo de
   `POST /diagnose`), e env vars (`PB_INSIGHT_MODEL`,
   `PB_INSIGHT_OPENAI_MODEL`) para trocar o default sem recompilar nada.
4. **O provedor/modelo usado é sempre impresso antes de gastar um token** —
   tanto no CLI quanto no corpo de resposta da API (`dryRun` ou não) — não é
   mais uma decisão invisível.

## Arquitetura

```
src/infrastructure/llm/
  claude-diagnostic-client.ts    ILLMClient via Anthropic SDK (default: claude-sonnet-5)
  openai-diagnostic-client.ts    ILLMClient via OpenAI SDK (default: gpt-4o-mini)
  llm-client-factory.ts          ponto único de escolha — createLLMClient(provider, model)
  diagnosis-prompt.ts            prompt compartilhado pelos dois (já era provider-agnostic)
```

A porta `ILLMClient` já existia (SPEC §4) exatamente para isto — trocar de
provedor é um adapter novo atrás da mesma interface, sem tocar em nenhum use
case. `llm-client-factory.ts` é o único lugar que decide qual classe
instanciar, usado tanto pelo CLI quanto pela API — sem duplicar a lógica de
seleção.

### CLI

```sh
npm run diagnose -- w_confirm_agm --ticket t.txt --event zoom --owner dw_agm18tab --dry-run
# Provedor:    claude (modelo default)

npm run diagnose -- w_confirm_agm --ticket t.txt --provider openai
# Provedor:    openai (modelo default)

npm run diagnose -- w_confirm_agm --ticket t.txt --provider claude --model claude-haiku-4-5
# Provedor:    claude (modelo: claude-haiku-4-5)
```

### API HTTP

```json
POST /diagnose
{
  "objectName": "w_confirm_agm",
  "ticketText": "...",
  "provider": "openai",
  "model": "gpt-4o-mini"
}
```

Resposta sempre inclui `"provider"` no nível superior, junto com `dryRun` e
`context`, para o chamador (ou um futuro frontend) sempre saber o que foi (ou
seria) usado.

## Configuração de chaves

`.env` do pb-insight (gitignored):
```
PB_INSIGHT_MODEL=claude-sonnet-5
OPENAI_API_KEY=sk-...
# PB_INSIGHT_OPENAI_MODEL=gpt-4o-mini
```

`ANTHROPIC_API_KEY` continua sendo resolvida com fallback para
`../teste-minimo/.env` (evita duplicar a chave em dois arquivos, conforme
docs/03). `OPENAI_API_KEY` não tem fallback — precisa estar no `.env` do
próprio pb-insight.

## Decisões registradas

1. **Não removi o Claude nem troquei o default para OpenAI.** O pedido foi
   "adicionar GPT também" (não substituir), e a qualidade do diagnóstico
   grounded já foi validada especificamente com modelos Claude (docs/03/04) —
   trocar o default de provedor sem revalidar seria arriscar qualidade para
   economizar sem medir. GPT fica disponível como opção explícita.
2. **`gpt-4o-mini` como default do lado OpenAI** — prioriza custo baixo,
   critério direto do pedido do usuário. Preços de LLM mudam; o modelo é
   configurável via `--model`/`PB_INSIGHT_OPENAI_MODEL`/body da API sem
   precisar editar código.
3. **Visibilidade antes de gastar, sempre** — tanto o CLI quanto a API
   imprimem/retornam o provedor e modelo antes (CLI) ou junto com (API) a
   resposta, mesmo fora de `--dry-run`/`dryRun`. O problema relatado não foi
   só "modelo caro" — foi "modelo caro escolhido sem eu perceber". A correção
   ataca as duas causas.
4. **`AppContext.llm` (instância fixa) virou `AppContext.createLLMClient`
   (fábrica)** — necessário para a API aceitar `provider`/`model` por
   requisição. Nenhum dos dois adapters chama rede na construção, então criar
   um por requisição não tem custo de performance.

## Limitações conhecidas

- Sem comparação de custo real entre os dois provedores para o mesmo ticket
  ainda — só a integração funcional. Rodar o mesmo chamado nos dois e
  comparar qualidade×custo é um próximo passo natural, não feito aqui.
- `OpenAIDiagnosticClient` usa `chat.completions.create` (API estável e bem
  documentada do SDK da OpenAI) — não usa recursos mais recentes como a
  Responses API; suficiente para o formato de prompt único usado aqui.
- Preços de ambos os provedores mudam com o tempo — os nomes de modelo
  default (`claude-sonnet-5`, `gpt-4o-mini`) refletem a escolha em
  2026-07-24; revisitar periodicamente.

## Próximos passos

- Rodar o mesmo ticket nos dois provedores e comparar custo/qualidade lado a
  lado (útil para decidir o default de verdade, com dado em vez de suposição).
- Os 2-3 chamados reais adicionais ainda pendentes desde docs/03, agora com a
  opção de rodar mais barato por padrão.
