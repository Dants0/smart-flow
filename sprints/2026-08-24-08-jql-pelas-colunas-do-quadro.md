# Aviso de chamados passa a espelhar as colunas do quadro

- **Data:** 2026-08-24
- **Solicitação:** "chamado na coluna de revisão, gerar exe, testes e resolvidos e entregues não precisam aparecer pra mim!"
- **Status:** concluído — migration aplicada, containers rebuildados

## Por que `statusCategory` não dava conta

A JQL da sprint 06 (`statusCategory != Done`) tinha cortado de 85 para 4, mas
deixava passar o SMART-51811, que está na coluna **Gerar Exe**. Lido da
configuração real do quadro **753 — "Kanban Faturamento/Internação - BUG´s"**
(`/rest/agile/1.0/board/753/configuration`), a categoria do Jira simplesmente
não acompanha a coluna:

| Coluna | Status | Categoria |
|---|---|---|
| Gerar Exe | 20403 Aguardando Versão Testes | **Pendências** |
| Testes | 13141 Aguardando Testes | **Pendências** |
| Resolvidos | 19774 Deploy Devops | **Em andamento** |
| Homologação | 24901 Homologação | **Pendências** |

Três colunas inteiras que o dev não quer ver estavam em categoria de trabalho
aberto. Nenhum ajuste de categoria resolveria.

## O que foi feito

```
assignee = currentUser()
  AND status not in (19653, 17600, 20403, 13141, 19738, 19774, 13145, 24901, 19772, 13144)
  ORDER BY created DESC
```

| Sai | Continua aparecendo |
|---|---|
| 19653 Revisão de Código · 17600 Em revisão | 19760 Novo · 1 Criado |
| 20403 Aguardando Versão Testes | 10437 Em Análise · 3 Em Andamento |
| 13141 Aguardando Testes · 19738 Em Teste | 12040 Em Desenvolvimento |
| 19774 Deploy Devops · 13145 Resolvido | 19773 Rejeitado Cliente |
| 24901 Homologação | 19771 Impedimento |
| 19772 Entregue · 13144 Fechado | |

Arquivos: `prisma/schema.prisma`, migration
`20260824210000_jql_pelas_colunas_do_quadro`, `settingsRepository.ts`,
`jiraService.ts` (comentário), `web/app/settings/jira/page.tsx`,
`web/components/JiraTroubleshooting.tsx`.

## Decisões

- **Por id de status, não por nome.** Nome muda com renomeação e com idioma da
  instância — e nome errado não filtra errado: derruba a consulta inteira em
  HTTP 400. Já aconteceu hoje (`status = "unresolved"`, sprint 06), e o sintoma
  chegou como banner vazio e 502, sem pista da causa.
- **Exclusão, não inclusão.** Um status novo no workflow passa a aparecer no
  aviso em vez de sumir calado. Para um aviso, errar mostrando é melhor que
  errar escondendo.

## Verificação

```
total=3 <- a JQL nova
      SMART-51888 | Em Desenvolvimento
      SMART-51229 | Em Desenvolvimento
      SMART-50927 | Em Desenvolvimento
```

SMART-51811 (Aguardando Versão Testes) saiu, como pedido. 135 testes passando,
`tsc` limpo nos dois projetos.

## Aberto, e o dev já apontou

A tela Configurações → Jira mostra a JQL como texto cru: uma lista de dez
números sem legenda. Não dá pra saber o que está filtrado sem abrir o Jira. Ver
proposta na sprint 09.
