# Mensagem montada em runtime e a corrente do código

- **Data:** 2026-08-21
- **Solicitação:** "muitos códigos não estão escritos ao pé da letra, muitos possuem variáveis mutáveis responsáveis por puxar e exibir o valor no messagebox" + corpo completo de `uof_testar_status` + "registre isso no CLAUDE.md dos módulos"
- **Status:** concluído

## O que foi registrado (o pedido)
1. **`modules/smartdesktop/CLAUDE.md`** ganhou duas seções:
   - **"A mensagem da tela quase nunca está literal no código"** — com o exemplo
     real (`sMsgAlt = "Este paciente está registrado no sistema como " + sStatus + "."`),
     o `CHOOSE CASE` que traduz `'O'` → `Óbito`, e o que fazer: procurar o
     **prefixo literal**, os nomes das variáveis, e confirmar **quem chama**.
   - **"Validação de paciente: `uof_testar_status` e as duas flags"** — o corpo da
     função (linha ~1903), as duas flags (`i_bAvancarObito`, default TRUE, e
     `i_bavancar` setada pelo evento `avancar` na linha ~2666), o `RETURN
     TRUE/FALSE` conforme o `MessageBox(..., YesNo!, 2)`, e o padrão correto de
     quem sobrescreve `avancar`.
2. **`modules/smartweb/CLAUDE.md`**: versão curta da mesma regra + a nota do
   `.sru.prp` companheiro.

## O que a investigação revelou (e virou código)
Medido contra o repositório e o PB Insight:

| Busca | Resultado |
|---|---|
| Frase inteira do print | **0 resultados** |
| Prefixo `"registrado no sistema como"` | 5 resultados — **e o primeiro é decoy** |

A frase literal **existe** hardcoded em `agenda50` (`w_consagd_med.srw:1967`,
`m_sheet.srm:4767`, `u_nv_agd_integra_sus.sru:518`) — cópias que **não** são as
que disparam nas telas do MWSUS. Buscar a mensagem leva ao módulo errado.

### Três correções
3. **Busca por frase com degradação** (`extractPhrases` + `phraseBackoff` em
   `pbInsight.ts`): extrai a frase citada no chamado e vai encurtando pela
   direita até casar. Medido: a frase inteira dá 0; na terceira tentativa
   ("...como Óbito.") dá 2.
4. **Seguir a corrente do código** (`declaredAncestors`): `type dw_pac01tab from
   u_dw_pac within w_x` liga a tela ao user object. A plataforma agora abre os
   ancestrais dos objetos que leu — era a lacuna nº 1 do Auto Mode.
5. **Termos que crescem com a leitura** (`harvestTerms`): o chamado escrevia
   "avança" (não `avancar`) e nunca citou `uof_testar_status`. Sem colher termos
   do próprio código, o ancestral era aberto **sem se saber o que procurar** e
   caía no cabeçalho. Agora cada arquivo lido é relido com os termos que ele
   próprio revelou (eventos, funções chamadas, flags de instância).
6. **Definição tem prioridade de orçamento**: as dezenas de ocorrências de uma
   flag no topo do arquivo enchiam o teto antes de chegar na linha 1903. Agora
   definições enchem o orçamento primeiro; chamadas entram com o que sobra, e
   trechos que não couberam são anunciados.

## Verificação
- **Teste de ponta a ponta no container, partindo de um chamado que cita APENAS
  a tela** (`w_sismama_citopatologico`), sem mencionar `u_dw_pac` nem
  `uof_testar_status`:

  ```
  w_sismama_citopatologico.srw   23.545 chars
  w_sheet_gen.srw                 7.649
  u_dw_pac.sru                   24.048   ← seguiu o ancestral
  u_datawindow_padrao.sru        23.710
  tem uof_testar_status: SIM   |  tem i_bAvancar: SIM
  ```
- `npm test`: **102 testes** verdes (9 novos). `typecheck` limpo.
- Backend reconstruído e no ar.

## Decisões
- **Documentar a armadilha, não só o fato.** O briefing agora diz *por que* a
  busca textual engana (decoys em agenda50), não só onde está o código certo.
- **Degradar a frase, não abandoná-la.** A mensagem é a pista mais direta que o
  chamado dá; o problema é só a cauda concatenada em runtime.
- **A busca cresce com o que lê.** Foi o que faltava: sem isso, seguir o
  ancestral não adiantava — abria o arquivo certo sem saber o que procurar.
- **Orçamento é decisão, não sobra.** Ordenar por linha fazia ruído no topo do
  arquivo expulsar a função relevante lá embaixo.

## Pendências
- A corrente segue **um nível** de ancestral por vez (a segunda passada não
  busca ancestral do ancestral). Cobre o caso real; herança mais profunda não.
- O PB Insight ainda não é usado para os objetos nomeados — só na busca por
  palavra-chave. O endpoint de evento dele daria o intervalo exato, dispensando
  a heurística de terminador.
