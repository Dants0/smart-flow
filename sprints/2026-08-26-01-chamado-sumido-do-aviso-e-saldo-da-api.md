# O chamado que sumiu do aviso, e o 400 que não é do plano Pro

- **Data:** 2026-08-26
- **Solicitação:** "socorro, um dos chamados que aparece no Jira não está aparecendo aqui... quando pesquiso no criar card diretamente SMART-51993 consigo puxar mas não aparece na tela" + o erro `400 credit balance is too low` visto em outro chamado
- **Status:** diagnosticado; o SMART-51993 foi devolvido ao aviso. Os dois problemas são independentes.

## 1. SMART-51993: estava dispensado

```sql
select * from "DismissedIssue";
 jiraKey     | at
 SMART-51229 | 2026-08-25 01:49
 SMART-51993 | 2026-08-26 12:30:49   <-- o X do banner, hoje
```

O aviso de "atribuído a você" (`GET /jira/pending`) filtra por três coisas
(`routes.ts:724`): a JQL do Jira, chamados que já viraram card, e a lista de
dispensados do usuário. O SMART-51993 caiu na terceira — alguém clicou no X.

Puxar pelo **Novo card** funcionava porque esse caminho é
`/rest/api/2/issue/SMART-51993` direto (`fetchJiraIssue`): nem JQL, nem
dispensa, nem card conhecido. Dois caminhos diferentes para o mesmo chamado, e
só um deles filtra — daí a sensação de "o Jira tem, o board não".

**Correção aplicada:** `delete from "DismissedIssue" where "jiraKey"='SMART-51993'`.
O banner repopula no próximo poll (60s) ou no F5.

### O X foi removido

Decisão do dev: **"para ele sumir basta desvincular dentro do próprio Jira"**.
E é isso mesmo — dispensar era uma segunda fonte da verdade, pior que a
primeira: `upsert` sem desfazer, sem validade e sem tela que mostrasse o que
estava escondido. Um clique errado tirava trabalho aberto do radar e só voltava
por `psql`.

Saiu inteiro:

| camada | o que saiu |
|---|---|
| `web/app/page.tsx` | botão X; `handleDismissPending` virou `hidePending` (só estado local, some o item recém-virado card) |
| `web/lib/api.ts` | `dismissPendingJiraIssue` |
| `routes.ts` | `POST /jira/pending/:key/dismiss`; o filtro de `/jira/pending` agora é só "já virou card" |
| `userRepository.ts` | `listDismissed`, `dismissIssue` |
| `schema.prisma` + migration `20260826120000` | model e tabela `DismissedIssue` |

O aviso passa a espelhar o Jira e só ele: desvinculou o assignee lá, o chamado
cai da JQL e some do banner no poll seguinte — reversível, no lugar onde o time
já trabalha.

Backend e web rebuildados; migration aplicada no boot. `typecheck` + 156 testes
+ `eslint` passando.

## 2. O 400 não tem relação com o plano Pro

```
History SMART-51229, 2026-08-26 12:32:48 -> ERRO
400 {"type":"invalid_request_error","message":"Your credit balance is too low
to access the Anthropic API..."}
```

São duas contas diferentes e a tela de limites do Claude Code confunde:

| | o que é | onde se resolve |
|---|---|---|
| **Plano Pro** (2% da sessão, 81% da semana) | assinatura do claude.ai / Claude Code | nada a fazer, tem folga |
| **`anthropicApiKey` do PlatformSettings** | API avulsa, pré-paga (`llm.ts:43`, SDK com `apiKey`) | console.anthropic.com > Plans & Billing |

A esteira roda pela **segunda**. A assinatura Pro não credita a API, então a
esteira fica parada até comprar crédito (ou trocar o provedor para OpenAI em
Configurações > IA).

## 3. E o SMART-51229 continua no board

Ele virou card e está em **ERRO**. A coluna Erro só é renderizada quando existe
card nela (`page.tsx:173`) e é a última do quadro — fica à direita de
Versionamento, fora da tela sem rolagem horizontal. Não sumiu.
