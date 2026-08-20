# Documentação de sprints por solicitação

- **Data:** 2026-08-20
- **Solicitação:** "a partir de agora você irá documentar na pasta sprints tudo o que foi realizado na solicitação"
- **Status:** concluído

## O que foi feito
1. Inspecionada a pasta `sprints/` (existia, vazia) e o histórico do repositório
   (`first commit` → `feat: fase 4`) para alinhar idioma e granularidade dos registros.
2. Criado `sprints/README.md` com a convenção de nomes e o template padrão dos registros.
3. Criado este registro como primeiro documento no novo formato.
4. Registrada a instrução como preferência persistente do assistente, para que os
   próximos atendimentos gerem um documento em `sprints/` automaticamente.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `sprints/README.md` | novo — convenção e template |
| `sprints/2026-08-20-03-documentacao-de-sprints.md` | novo — este registro |

## Decisões
- **Um arquivo por solicitação**, não por dia nem por fase: mantém o rastro colado ao
  pedido do usuário, que foi o critério citado na instrução.
- **Nome com data + sequência + slug** (`YYYY-MM-DD-NN-slug.md`): ordena cronologicamente
  no `ls` e suporta mais de um atendimento no mesmo dia.
- **Registros descrevem o realizado**, não o planejado.
- Na entrega original as fases 1–4 ficaram de fora, por a instrução valer "a partir
  de agora"; o usuário pediu o histórico na sequência e ele foi reconstruído em
  `2026-08-20-04`. Este registro foi renumerado de `-01-` para `-03-` na ocasião,
  para preservar a ordem cronológica do dia (as fases 3 e 4 são anteriores a ele).

## Pendências
- Nenhuma.
