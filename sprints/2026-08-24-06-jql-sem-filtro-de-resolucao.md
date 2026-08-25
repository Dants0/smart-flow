# JQL de chamados atribuídos: filtrar por categoria de situação, não por resolução

- **Data:** 2026-08-24
- **Solicitação:** "ajustar o filtro dos chamados do JIRA... o SMART-51229 não está aparecendo!" — depois: "ainda está aparecendo um monte de chamado"
- **Status:** concluído — migrations aplicadas, containers rebuildados, resultado conferido contra o Jira real

## O sintoma

O SMART-51229 (`INC/BUG - SMART: Ausência de POP-UP de instruções após
selecionado`) está no quadro Kanban em **DESENVOLVIMENTO**, atribuído ao dev, e
não aparecia no aviso de chamados atribuídos da esteira.

## As três causas (foram três, não uma)

**1. `resolution = Unresolved` na JQL default.** No Jira do time resolução e
situação não andam juntas: o SMART-51229 está com `status = "Em
Desenvolvimento"` e `resolution = "Concluída"` (id 7, *GreenHopper Managed
Resolution* — resolução que o quadro ágil grava sozinho). O filtro descartava
exatamente o trabalho ainda aberto.

**2. Dispensa gravada no banco.** Tirado o filtro, o chamado continuou sumido:
havia uma linha em `DismissedIssue` para `SMART-51229` (única da tabela inteira,
gravada às 20:30 de 24/08). O `GET /jira/pending` filtra por `knownKeys` e por
`dismissed` — corretamente, só que **não existe desfazer**: o X do banner é
irreversível pela interface.

**3. A JQL sem filtro nenhum trouxe 85 chamados.** `assignee = currentUser()`
sozinho pega o histórico inteiro do dev; o `maxResults=20` virou banner com 18
avisos. E a tentativa manual de conter isso, salva pela tela de Configurações
(`status = "unresolved"`), é JQL inválida — o Jira responde
`HTTP 400: O valor 'unresolved' não existe para o campo 'status'`, o que
derrubava o banner em 502 (6 de 14 chamadas a `/jira/pending` no log).

## A medição

Rodado contra `portalcliente.pixeon.com` com a credencial já guardada, pela
mesma rota que o board usa:

| JQL | Total |
|---|---|
| `assignee = currentUser()` | **85** |
| `assignee = currentUser() AND resolution = Unresolved` | **2** |
| `assignee = currentUser() AND statusCategory != Done` | **4** |

Os 4 são exatamente as colunas DESENVOLVIMENTO + GERAR EXE do quadro:

```
SMART-51888 | Em Desenvolvimento       | resolucao=-          | criado=2026-08-14
SMART-51811 | Aguardando Versão Testes | resolucao=Concluída  | criado=2026-08-07
SMART-51229 | Em Desenvolvimento       | resolucao=Concluída  | criado=2026-07-01
SMART-50927 | Em Desenvolvimento       | resolucao=-          | criado=2026-06-09
```

## O que foi feito

JQL default passou a ser:

```
assignee = currentUser() AND statusCategory != Done ORDER BY created DESC
```

| Arquivo | Mudança |
|---|---|
| `prisma/schema.prisma` | `@default` do `jiraAssignedJql` |
| `migrations/20260824190000_jql_sem_filtro_de_resolucao/` | tira o `resolution = Unresolved` |
| `migrations/20260824200000_jql_por_categoria_de_status/` | entra o `statusCategory != Done` |
| `src/infra/settingsRepository.ts` | `DEFAULTS.jiraAssignedJql` |
| `src/infra/jiraService.ts` | comentário de `searchAssignedIssues` |
| `web/app/settings/jira/page.tsx` | hint do campo |
| `web/components/JiraTroubleshooting.tsx` | item 4 |

Mais um `DELETE` na `DismissedIssue` do SMART-51229 — dado desta máquina, fora
de migration de propósito.

## Decisões

- **`statusCategory`, não a lista de status.** `statusCategory` é campo de
  sistema com três valores (To Do / In Progress / Done); não depende dos nomes
  do workflow nem do idioma da instância. Listar status na mão
  (`status not in (Entregue, Resolvidos)`) quebraria na primeira renomeação — e
  errar o nome derruba a consulta inteira em 400, que foi exatamente o que
  aconteceu com o `status = "unresolved"`.
- **A migration também corrige a JQL inválida salva na mão.** O `WHERE` lista os
  três valores conhecidos. Quem tiver customização própria não perde nada; quem
  estava com a consulta quebrada volta a funcionar sem ter que saber disso.
- **Nada mudou no comportamento do board.** A consulta só gera aviso; card é
  criado por escolha do dev.

## Verificação

Reproduzido o `GET /jira/pending` dentro do container, depois do rebuild:

```
JQL devolveu: SMART-51888, SMART-51811, SMART-51229, SMART-50927
banner mostraria: 2 -> SMART-51811, SMART-51229
filtrados por já terem card: SMART-51888, SMART-50927
filtrados por dispensa: (nenhum)
```

126 testes passando, `tsc --noEmit` limpo nos dois projetos.

## Entrega

`docker compose up -d --build backend web` na raiz. O `prisma migrate deploy`
avulso não roda do host (o `db` do compose raiz não publica a 5432); quem aplica
é o `CMD` da imagem. O mesmo rebuild entregou as sprints 04 e 05 e a rota
`/objects/:name/events/:eventName/siblings` do pb-insight.

## Achados que ficaram abertos

- **Não dá pra desfazer uma dispensa pela interface.** Um X sem querer esconde o
  chamado para sempre; só `DELETE` no banco traz de volta. Falta o "mostrar
  dispensados" ou um desfazer com prazo.
- **A tela de Configurações aceita JQL inválida sem avisar.** O board só reage
  com 502 e o dev não tem como ligar uma coisa na outra. O `POST /me/jira/test`
  já sabe a resposta (`jqlError`) — falta chamá-lo no salvar.
- Continua aberta: correção nos 6 `.srw` do `mwsus` (SMART-50927).
