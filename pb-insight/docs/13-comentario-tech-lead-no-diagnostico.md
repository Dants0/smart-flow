# 13 — Comentário do tech lead como contexto extra no diagnóstico

> Pedido em 2026-07-24: quando um chamado já tem uma sugestão de causa colada
> por um tech lead, o usuário quer colar esse texto na aba de Diagnóstico e
> tê-lo usado como contexto adicional pela API — não só o texto do chamado.

## O que mudou

Novo campo opcional `techLeadComment` (string) em todo o caminho de
diagnóstico:

- **Frontend** (`DiagnosePanel.tsx`): textarea "Comentário Tech Lead
  (opcional)", logo abaixo de "Texto do chamado". Vai junto no `POST
  /diagnose` e, se o diagnóstico for salvo, também no `POST /diagnoses`.
- **API HTTP**: `POST /diagnose` e `POST /diagnoses` aceitam
  `techLeadComment` no body (opcional, sem default).
- **CLI**: `npm run diagnose -- <objeto> --ticket t.txt --tech-lead
  comentario.txt` lê o arquivo e repassa.
- **`DiagnoseTicketUseCase.diagnose(preparation, ticketText, images?,
  techLeadComment?)`** — novo 4º parâmetro, repassado para
  `ILLMClient.synthesizeDiagnosis` via `DiagnosticContext.techLeadComment`.
- **Prompt** (`diagnosis-prompt.ts`): quando presente, adiciona uma seção
  `--- COMENTÁRIO DO TECH LEAD ---` depois do chamado, com uma instrução
  explícita: é uma pista humana para direcionar a investigação, **não** um
  fato aceito de antemão — o modelo deve verificar contra o código fornecido
  e dizer se o código contradiz a hipótese do tech lead.
- **Diagnóstico salvo** (`SavedDiagnosis.techLeadComment: string | null`):
  persistido junto quando o diagnóstico é salvo, para o histórico mostrar
  qual pista humana embasou aquela chamada. `null` quando não informado.

## Por que "pista a verificar", não "fato dado"

Mesma calibração de confiança que o resto do motor de diagnóstico usa (ver
docs/03): um tech lead pode estar certo ou pode estar ancorando o modelo
numa hipótese errada. O prompt pede explicitamente para o modelo confrontar
o comentário com o código antes de aceitá-lo — se simplesmente injetássemos
o comentário como parte do "chamado", o modelo tenderia a tratá-lo como
descrição do sintoma em vez de hipótese a testar.

## Decisão registrada

Não criei um campo separado no formulário de chamado (`ticketText`) — o
comentário do tech lead é conceitualmente diferente (é uma hipótese de
causa, não a descrição do sintoma), por isso vai para uma seção própria no
prompt e é armazenado como campo próprio no diagnóstico salvo, em vez de
ser concatenado ao texto do chamado.
