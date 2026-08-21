# Aceitar aplica o código, e o caminho para o Auto Mode

- **Data:** 2026-08-21
- **Solicitação:** "aceitar a solução deve alterar diretamente o código fonte mapeado"; aviso de que a seção do `avancar`/`i_bAvancar` foi removida do `modules/smartdesktop/CLAUDE.md` para observar o novo comportamento; e o objetivo de longo prazo: uma flag **Auto Mode** que roda análise, desenvolvimento, revisão, versionamento e resolução sem clique
- **Status:** concluído (a mudança pedida); o Auto Mode virou plano, não código

## O que foi feito
1. **`POST /cards/:id/accept` passou a aplicar o diff** no working copy mapeado
   (`SMART_DESKTOP_PATH` / `SMART_WEB_PATH`) e só então mover o card pra
   VERSIONAMENTO. Um clique, não dois.
2. **Se o apply falhar, o card não muda de estágio** — fica em REVISÃO com o
   erro na tela. Versionar sem o código aplicado não faz sentido.
3. **Não reaplica** quando o card já tem `appliedAt`: aplicar duas vezes por
   cima duplicaria a mudança.
4. **A tela passou a dizer a verdade**: "Aceitar aplica o diff no seu working
   copy... A alteração é local e reversível de um clique; nada é commitado sem
   você mandar."
5. **Memória `meta-auto-mode`** criada: o objetivo do Auto Mode passa a ser a
   régua de avaliação de cada decisão de design.

## Decisões
- **As garantias continuam onde estavam.** O que muda é quantos cliques, não o
  quanto a operação é segura: `patch --dry-run` antes de tocar em arquivo,
  backup por arquivo, artefato de build recusado, "desfazer" no passo 1.
- **Falha não avança estágio.** É a regra que impede o pior caso do Auto Mode:
  card em versionamento sem código aplicado, seguindo pro commit.

## Observação sobre o experimento do briefing
A análise anterior citava o próprio briefing como evidência ("o briefing do
sistema documenta esse padrão e cita textualmente este chamado"). Isso é
**circular**: eu tinha escrito ali a conclusão do chamado, e o modelo a repetiu.
Remover a seção é o teste certo — se a plataforma reencontrar o padrão pelo
código, o mérito é da recuperação; se não reencontrar, o briefing estava
compensando um buraco.

**Risco previsto do teste:** sem o briefing, a análise pode não nomear
`u_dw_pac`, e hoje o material só busca objetos **nomeados** na análise ou no
chamado. As janelas viriam (o chamado as nomeia) e o trecho mostraria
`event avancar;call super::avancar;` — mas para saber que o ancestral seta
`i_bAvancar` seria preciso abrir o ancestral, e ninguém segue essa corrente
ainda. É a lacuna nº 1 da lista abaixo.

## Auto Mode: o que falta (avaliação honesta)
1. **Seguir a corrente do código.** Hoje: objetos nomeados. Falta: ancestral de
   `call super::`, tipo declarado de um controle (`dw_pac01tab` é `u_dw_pac`) e
   chamadores. Sem isso a análise depende de alguém ter escrito o padrão num
   briefing — exatamente o que o experimento vai expor.
2. **Conferir o diff, não só se ele aplica.** `patch --dry-run` prova que
   encaixa, não que está certo. Falta uma segunda passada revisando o diff
   contra o conteúdo real do arquivo (pega arquivo gêmeo trocado, lógica
   invertida, `RETURN` no lugar errado).
3. **Isolamento por card.** Um working copy compartilhado com 34 arquivos sujos
   não suporta dois cards em paralelo, e impede criar/trocar branch. O caminho
   natural é `git worktree` por card: checkout isolado, a partir de base limpa,
   sem tocar na árvore do dev. Resolve criação de branch, concorrência e
   segurança de uma vez.
4. **Freios de laço.** Auto Mode precisa de teto de tentativas, teto de custo por
   card e **gate de confiança** — `confidence: 'baixa'` não deveria commitar
   sozinho. Hoje `confidence` é decorativo, como `needsTrace` era.
5. **Onde o humano continua.** Mesmo em Auto Mode, o PR é o gate natural
   (revisão do time) e o comentário no Jira é registro oficial — os dois
   merecem continuar exigindo aprovação, ou pelo menos serem reversíveis.

## Verificação
- `typecheck`, `eslint`, `build` (web) e `npm test` (89) verdes.
- Backend e web reconstruídos e no ar.
- **Não exercitei o novo aceite num card real** — ele agora escreve no
  `C:\controle de versão\smart_desktop`, e o primeiro uso é seu.

## Pendências
- As cinco lacunas do Auto Mode acima, em ordem de valor.
- A gaveta lateral do board ainda usa o layout antigo.
