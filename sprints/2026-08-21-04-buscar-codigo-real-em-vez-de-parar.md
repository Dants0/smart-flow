# Buscar o código real em vez de parar (gate de material, não de trace)

- **Data:** 2026-08-21
- **Solicitação:** reanálise do SMART-50927 com as guardas ligadas + "nem todo chamado possui um trace, então depender dele para exibir ou não X informação é errado"
- **Status:** concluído

## O que a reanálise mostrou
A análise nova acertou a causa raiz — `u_dw_pac`, `uof_testar_status()`,
`i_bAvancar` não checado após `call super::avancar` — e citou o briefing que
ganhou essa seção ontem. As guardas funcionaram: nada de função inventada.

Mas ela terminou assim:

> "Não há no contexto de código fornecido o conteúdo real das janelas MWSUS
> específicas [...] É necessário localizar e inspecionar o evento 'avancar' de
> cada uma das 4 janelas."

E marcou `needsTrace: true`, o que fez a esteira parar. **Dois erros meus:**

1. **O gate estava no lugar errado.** Você tem razão: nem todo chamado tem
   trace, e condicionar comportamento a ele é errado. Pior — o que faltava aqui
   **não era trace**, era código. O modelo usou `needsTrace` como "faltou alguma
   coisa" porque era o único sinal disponível no contrato.
2. **A plataforma tinha o código e não olhou.** O repositório está montado no
   backend desde anteontem. `git grep -n "^event avancar"` devolve
   `w_lea_aih.srw:150` em um segundo — exatamente a linha que a análise correta
   apontou.

## O que foi feito
1. **`infra/sourceExcerpts.ts`** (novo): lê o **código real** dos objetos que a
   análise citou.
   - `extractIdentifiers()` tira do texto da análise os identificadores no estilo
     PowerBuilder (`u_dw_pac`, `i_bAvancar`, `uof_testar_status`, `avancar`) —
     são eles que dizem qual trecho do arquivo interessa.
   - `gatherSourceMaterial()` resolve os objetos em caminhos reais e recorta os
     trechos com `git grep -n -C25`. Sem casar nada, cai no cabeçalho do objeto.
   - Tetos: 6 arquivos, 8 mil caracteres cada, 40 mil no total — o material entra
     no prompt e é pago por card.
2. **O gate virou material, não trace.** Antes de DESENVOLVIMENTO, a esteira
   busca o código dos objetos apontados. Com material, propõe (com ou sem trace).
   Sem material, para em REVISÃO dizendo **o que não encontrou**.
3. **O proposer recebe o código**, não só os caminhos: seção "Código real dos
   objetos afetados (lido do repositório, com nº de linha)".
4. **`needsTrace` virou informativo** no contrato, no prompt do analyzer e na
   tela: "um pbtrace deixaria esta análise mais firme" em vez de "pede um
   pbtrace antes de propor". E o analyzer foi instruído a **não** marcar
   `needsTrace` quando o que falta é ler código — nesse caso, listar os objetos,
   porque a plataforma busca.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `src/infra/sourceExcerpts.ts` | novo — busca o código real |
| `src/orchestrator/orchestrator.ts` | gate de material no lugar do de trace |
| `src/agents/proposer.ts` | código real no prompt |
| `src/agents/analyzer.ts`, `src/agents/contracts.ts` | `needsTrace` informativo |
| `web/components/card/CardContent.tsx` | texto do aviso de trace |
| `tests/agentOutput.test.ts` | 3 casos de `extractIdentifiers` |

## Decisões
- **Buscar é melhor que pedir.** Parar para pedir ao dev o que a própria
  plataforma acha em um segundo é desperdiçar a análise e o tempo dele.
- **O gate certo é "tenho código?", não "tenho trace?".** Trace é evidência de
  execução — ótimo quando existe, e a maioria dos chamados não tem. Código, a
  plataforma sempre tem.
- **`git grep` no lugar de mandar o arquivo inteiro.** Objeto PowerBuilder passa
  de 10 mil linhas; o que interessa são as ~50 em volta do identificador que a
  análise nomeou. Isso é complementar ao PB Insight, não substituto: o RAG
  procura por significado em 16 mil arquivos, isto abre os que já foram nomeados.
- **Tetos explícitos.** Material sem limite viraria prompt gigante e caro em todo
  card — e empurraria o resto do contexto pra fora da janela.

## Verificação
- `npm test`: 9 arquivos, **89 testes** (3 novos), verdes. `typecheck` limpo.
- **Teste de ponta a ponta dentro do container, contra o repositório real**:
  identificadores extraídos (`u_dw_pac, i_bAvancar, uof_testar_status, avancar`),
  3 de 4 objetos resolvidos, o quarto (fictício) corretamente reportado como não
  encontrado, e o trecho de `w_lea_aih.srw` contendo
  `150:event avancar;call super::avancar;` — a linha exata da análise correta.
- **Não reprocessei o card de novo.** O SMART-50927 está em REVISÃO com a
  análise nova (que está certa); reprocessar agora custaria tokens e é decisão
  sua — mas é o teste real de saber se, com o código na mão, o proposer acerta o
  diff das 4 telas.

## Pendências
- `gatherSourceMaterial` roda duas vezes por card (uma no gate, outra no
  proposer). São dois `git grep` locais, baratos, mas dá pra passar o material
  adiante em vez de recalcular.
- A busca depende de a análise **nomear** os objetos. Se ela não nomear nada, o
  gate segura o card — que é o comportamento correto, mas seria melhor tentar
  extrair nomes do texto do chamado antes de desistir.
