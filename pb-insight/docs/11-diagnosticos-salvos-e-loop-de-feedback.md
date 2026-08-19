# 11 — Diagnósticos salvos, "dar como solucionado" e correção de Markdown

## Pedidos do usuário

1. Salvar um diagnóstico gerado.
2. Apagar um diagnóstico salvo.
3. "Dar como solucionado a partir do diagnóstico gerado".
4. Bug: a saída do diagnóstico (`**Causa raiz:**`, etc.) aparecia como texto
   Markdown cru na tela, não renderizado.
5. Melhorar UI/UX — background mais agradável, mais polimento visual.

## 1–3. Diagnósticos salvos + loop de feedback

Novo domínio: `SavedDiagnosis` (`src/domain/entities/saved-diagnosis.ts`) —
guarda o resultado já retornado por `POST /diagnose` (objeto, evento, texto
do chamado, texto do diagnóstico, provedor/modelo, objetos usados no
contexto). **Salvar não chama o LLM de novo** — só persiste o que o cliente
já recebeu.

- `IDiagnosisRepository` + `JsonDiagnosisRepository` (mesmo padrão JSON dos
  outros repositórios do projeto).
- `SaveDiagnosisUseCase` — persiste com id/createdAt gerados.
- `MarkDiagnosisResolvedUseCase` — **o elo mais importante desta entrega**:
  "dar como solucionado" não é só uma flag — cria um `Ticket` real (usando
  `AddTicketUseCase`, `descriptionRaw` = texto do chamado, `resolutionText` =
  texto do diagnóstico) e um `TicketObjectLink` (via
  `LinkTicketToObjectUseCase`, apontando pro objeto/evento diagnosticado),
  depois marca `resolvedTicketId` no diagnóstico salvo. Rejeita marcar duas
  vezes o mesmo diagnóstico como resolvido.

  Isso fecha o loop de feedback humano que o SPEC §1 descreve na visão
  original: cada diagnóstico confirmado como correto vira automaticamente um
  caso de referência na base de conhecimento (§13.5/§13.6, docs/09) — sem
  isso, o motor de diagnóstico nunca aprenderia com seus próprios acertos.

- Endpoints: `POST /diagnoses`, `GET /diagnoses`, `GET /diagnoses/:id`,
  `DELETE /diagnoses/:id`, `POST /diagnoses/:id/resolve`.
- Frontend (`DiagnosePanel.tsx`): botão "Salvar diagnóstico" após um
  resultado real (não dry-run); seção "Diagnósticos salvos" com preview,
  botão "Apagar" e botão "Dar como solucionado" (abre um mini-formulário
  inline para `externalId` + notas opcionais).

**Não incluído**: wiring automático de `MarkDiagnosisResolvedUseCase` de
volta para dentro do próprio `DiagnoseTicketUseCase` (ex: sugerir tickets
semelhantes automaticamente ao gerar um novo diagnóstico) — isso é a mesma
pendência de §13.7 já registrada em docs/09/10, não resolvida aqui.

## 4. Correção do bug de Markdown

`DiagnosePanel.tsx` jogava `result.diagnosis.text` dentro de um `<pre>` —
mostrava `**Causa raiz:**` literalmente em vez de **Causa raiz:** em
negrito. Trocado por `react-markdown` (nova dependência do frontend,
`frontend/package.json`), renderizando dentro de uma div `.markdown` com
estilos próprios em `index.css` (headings, listas, `code` inline, blocos de
código, blockquote) — consistente com o tema light/dark já existente.

Validado ao vivo: gerei um diagnóstico real via OpenAI (a conta Anthropic
estava sem crédito no momento — `"Your credit balance is too low"`, erro do
provedor, não da aplicação) e confirmei que **Causa raiz:**, **Correção
sugerida:**, etc. renderizam em negrito de verdade, com nomes de objeto como
`w_definir_periodo` em chips de código inline.

## 5. UI/UX

`index.css` recebeu uma passada de polimento:
- Fundo trocado de uma cor sólida acidental (`#ffffed`, um bege claro — quase
  certamente um typo de `#ffffff`) para um gradiente radial sutil (azul muito
  claro / branco no light mode; azul-marinho escuro no dark mode).
- Sombras suaves em cards e itens de resultado (`--shadow`/`--shadow-hover`),
  com leve elevação no hover.
- Transições em botões, abas, chips e inputs (cor, sombra, foco).
- Título com leve gradiente de texto; aba ativa destacada na cor de destaque
  em vez de só a borda inferior.
- Foco em inputs com anel de destaque (`box-shadow`) em vez de depender só
  do outline do navegador.

## Testes e validação

- Backend: +6 testes (119 no total) — `json-diagnosis-repository.test.ts`
  (persistência, ordenação, delete, markResolved), `diagnoses.test.ts`
  (`SaveDiagnosisUseCase`, `MarkDiagnosisResolvedUseCase` incl. rejeição de
  diagnóstico inexistente e de resolver duas vezes), `server.test.ts` (fluxo
  HTTP completo: salvar → listar → detalhar → resolver → tentar resolver de
  novo → apagar → apagar de novo).
- Frontend: `tsc -b --noEmit` e `oxlint` limpos.
- Validação manual ao vivo: gerei um diagnóstico real (OpenAI, já que a
  Anthropic estava sem crédito), salvei pela UI, dei como solucionado com
  `externalId` de teste, e confirmei via `GET /tickets` que o Ticket +
  `TicketObjectLink` reais foram criados corretamente. Depois limpei
  `.data/tickets.json` e `.data/diagnoses.json` para não poluir a base real.
