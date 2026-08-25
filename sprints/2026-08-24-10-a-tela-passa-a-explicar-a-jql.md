# Configurações → Jira passa a explicar (e conferir) a consulta

- **Data:** 2026-08-24
- **Solicitação:** "na tela de configuração não tem nada intuitivo sobre o filtro... todo novo usuário vai vir com essa configuração?" — e o pedido de fazer os três itens propostos
- **Status:** concluído — containers rebuildados, conferido contra o Jira real

## O problema

A tela mostrava a JQL como texto cru. Depois da sprint 08 isso virou
`status not in (19653, 17600, 20403, 13141, 19738, 19774, 13145, 24901, 19772, 13144)`:
dez números sem legenda, impossível de auditar sem abrir o Jira e conferir id
por id. E consulta inválida salvava calada — o sintoma aparecia longe da causa,
como 502 no board (foi o que aconteceu hoje de manhã).

**Resposta à pergunta do dev:** `PlatformSettings` é **uma linha só**
(`id = 1`), global. A JQL é a mesma pra todos; quem personaliza é o
`currentUser()`, que resolve pela credencial de cada um. Usuário novo não ganha
cópia nem configuração própria. O `@default` do schema só vale pra banco novo.

## O que foi feito

**1. Legenda, lida do Jira.** `domain/jqlStatuses.ts` (novo) extrai as situações
excluídas da JQL — aceita id, nome com aspas e `status != x` — e
`jiraService.previewJql` traduz cada uma para o nome que o dev lê no quadro,
consultando `/rest/api/2/status`. A tela mostra:

```
✓ 3 chamados atribuídos a você   SMART-51888, SMART-51229, SMART-50927
Escondendo 10 situações: Revisão de Código · Em revisão · Aguardando Versão
Testes · Aguardando Testes · Em Teste · Deploy Devops · Resolvido ·
Homologação · Entregue · Fechado
```

**2. "Restaurar padrão".** `GET /settings` passa a devolver
`jiraAssignedJqlDefault` (constante `DEFAULT_ASSIGNED_JQL` exportada pelo
repositório). O botão fica desabilitado quando a consulta já é a padrão, com a
etiqueta "consulta padrão" ao lado. O front não repete a string — ela sairia de
sincronia no primeiro ajuste.

**3. Validação no salvar.** `POST /jira/jql/preview` roda a consulta com
`maxResults=5` antes de gravar. Recusa do Jira **não salva** e mostra a
mensagem original:

```
O Jira recusou a consulta: O valor 'unresolved' não existe para o campo 'status'.
```

5 testes novos em `tests/jqlStatuses.test.ts` — 140 no total (era 135).

## Decisões

- **Recusa do Jira volta 200 com `error`, não 4xx.** Quem chama é a tela, e ela
  precisa MOSTRAR o texto do erro. Como status de erro HTTP, o cliente trataria
  igual a "Jira fora do ar" — que é justamente a confusão que originou o pedido.
- **Falar com o Jira e o Jira recusar são estados separados na tela.** Jira fora
  do ar não bloqueia salvar (a consulta pode estar ótima); consulta recusada
  bloqueia. Travar o salvamento por indisponibilidade seria pior que salvar sem
  conferir.
- **A legenda vem do Jira, não de uma tabela no código.** Uma lista escrita na
  mão envelheceria na primeira renomeação de status — e mentir na legenda é pior
  que não ter legenda.
- **Confere ao abrir a tela, sem esperar clique.** Discoverability era o pedido;
  legenda atrás de um botão deixaria o dev na mesma situação.

## Verificação

Três casos contra o Jira real, depois do rebuild:

| Consulta | Resultado |
|---|---|
| a padrão (ids) | total=3, 10 situações traduzidas |
| `status = "unresolved"` | recusada, com a mensagem do Jira |
| `status not in ("Entregue", "Fechado")` | total=4, 2 situações (nome → id) |

140 testes, `tsc` limpo nos dois projetos, `eslint` limpo nos arquivos tocados.

## Aberto

- **A amarra que o dev apontou continua:** o `@default` do produto carrega ids
  de status desta instância do Jira. Em instalação nova em outro Jira, o aviso
  viria vazio até alguém ajustar a consulta. Hoje a tela ao menos denuncia isso
  na hora ("A consulta é válida, mas não traz nenhum chamado agora"). A saída
  definitiva seria montar o padrão a partir da configuração do quadro no primeiro
  acesso — vale quando existir uma segunda instalação.
- Dispensa do banner continua sem desfazer (sprint 06).
- Correção nos 6 `.srw` do `mwsus` (SMART-50927).
