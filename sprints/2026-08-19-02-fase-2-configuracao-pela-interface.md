# Fase 2 — Configuração pela interface

- **Data:** 2026-08-19
- **Solicitação:** tirar a configuração da plataforma do `.env` e torná-la editável pela própria aplicação, valendo na hora
- **Status:** concluído
- **Commit:** `9d8af03` ("projeto") — 18 arquivos, +761/−101
- **Registro reconstruído retroativamente a partir do histórico git** (ver `2026-08-20-04`)

## O que foi feito
1. **Modelo `PlatformSettings`** (migração `20260819193910_platform_settings`):
   linha única (`id = 1`) guardando chave e modelo da Anthropic, provider de IA,
   chave e modelo da OpenAI, URL do app_trace, dados do Jira (URL, usuário,
   senha, JQL de chamados atribuídos) e URL do PB Insight.
2. **`infra/settingsRepository.ts`**: `getSettings`/`updateSettings` com
   `upsert` da linha na primeira leitura, defaults centralizados e patch
   parcial — string vazia vira `null` em vez de apagar campo sem querer.
3. **Consumo da configuração no lugar do `.env`**: `llm.ts`, `jiraService.ts`,
   `traceService.ts` e `pbInsight.ts` passaram a ler as settings a cada chamada;
   `infra/anthropic.ts` foi removido. O `.env.example` do backend encolheu de 27
   para poucas linhas — sobraram só as variáveis de bootstrap.
4. **Rotas de configuração** em `http/routes.ts` (leitura e atualização).
5. **Tela de Configurações no front**, substituindo o `SettingsModal`:
   `app/settings/layout.tsx` com navegação lateral e as páginas `ai`, `jira` e
   `services`, mais os campos reutilizáveis em `components/settings/fields.tsx`
   e os clientes em `lib/api.ts`.

## Decisões
- **Banco, não arquivo.** Só `DATABASE_URL` e `PORT` seguem no `.env`, porque o
  processo precisa deles antes de conseguir falar com o banco. Todo o resto é
  editável pela interface.
- **Settings lidas a cada chamada, nunca cacheadas em módulo** — é o que faz
  uma troca na tela valer na hora, sem reiniciar o backend.
- **Linha única com `id = 1`** em vez de tabela chave-valor: a configuração é
  tipada e finita, e o schema documenta o que existe.

## Pendências desta fase (resolvidas depois)
- Senha do Jira gravada em texto puro, e uma única conta Jira para todos → fase 3.
