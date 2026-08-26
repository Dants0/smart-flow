# Módulo: SMARTWEB

> Este arquivo é o briefing que a IA recebe em toda análise/proposta deste
> módulo. Quanto mais preciso, menos alucinação. Trate como documento vivo:
> cada bug bem resolvido vira uma linha nova aqui.

## Visão geral

<!-- O que é o SMARTWEB dentro do SMART, que fluxo de negócio ele cobre,
     quem são os usuários (recepção, laboratório, faturamento...). -->
Módulo web do SMART. (preencher: escopo funcional, telas principais)

## Stack e ambiente

- PowerBuilder / PFC
- Bancos: **SQL Server** e **Oracle** — atenção a diferenças de SQL, tipos
  de data e comportamento de `stored procedures` entre os dois.
- Parâmetros de comportamento via **INI** (documentar os que afetam este módulo).

## A mensagem da tela quase nunca está literal no código

Vale aqui como no SMART Desktop: o texto que o usuário vê costuma ser montado em
tempo de execução, por concatenação de variáveis —
`sMsg = "prefixo " + sStatus + "."` —, e o rótulo (`Óbito`, `Inativo`...) vem de
um `CHOOSE CASE` que traduz o código do banco.

- Procurar a **frase inteira** do print normalmente não acha nada.
- Procurar um **pedaço** pode achar o lugar errado: o mesmo texto costuma existir
  hardcoded em outros objetos, cópias independentes que não são as que disparam
  na tela do chamado.
- O que funciona: o **prefixo literal** que sobrou da concatenação, os **nomes
  das variáveis**, e confirmar **quem chama** o objeto a partir da tela relatada.

## Fontes e companheiros

O código versionado é `fontespb11/<modulo>/`, e **cada `.sru` tem um `.sru.prp`
ao lado**. Alteração de objeto sobe com o par — commitar um sem o outro deixa o
objeto inconsistente no PR.

## Convenções do time

- Branch: o dev cria manualmente a partir do `main` atualizado.
- PR: seguir as convenções do time (TortoiseGit). Referenciar sempre o Jira key.
- Mudanças **cirúrgicas** — não reescrever objetos inteiros.

## Objetos-chave

<!-- Liste os objetos que mais aparecem em chamados: windows, datawindows,
     NVOs, procedures. Isso ancora o RAG e reduz busca às cegas. -->
| Objeto | Tipo | Responsabilidade |
|--------|------|------------------|
| (preencher) | window | |
| (preencher) | datawindow | |
| (preencher) | nvo | |

## Armadilhas conhecidas

<!-- O ouro do arquivo. Cada uma economiza uma rodada de análise errada. -->
- Diferença de comportamento Oracle vs SQL Server em (preencher).
- Conversão de trace UTF-16LE ao ler pbtrace (ver pbtrace-tool).
- **"Texto cortado" nunca é uma hipótese, são três camadas** — gravação (`MID`,
  coluna curta, variável de tamanho fixo), leitura (o SELECT lê a coluna
  truncada em vez da íntegra) e exibição (controle, autosize, troca de fonte
  depois do cálculo de altura). Contar `LEN()` nos três pontos é o que separa
  diagnóstico de palpite; propriedade de controle é a **última** coisa a
  investigar, porque é a mais fácil de teorizar sem evidência.
- **Objeto compartilhado exige alteração condicional** — com o comportamento
  antigo intacto por padrão e a regressão do outro consumidor no teste.
- Armadilhas de compilação que valem aqui como no Desktop: shared variable é
  escopo de classe (`w_x.s_var` de fora dá `C0019`); variável de instância e
  função pública não servem com `OpenWithParm` em janela `response!` (não existe
  instância antes do `Open`); nunca escrever caractere acentuado direto no fonte
  exportado (a exportação alterna Latin-1 e UTF-8 e corrompe o arquivo).
- (preencher)

## Como validar uma correção

- Reproduzir o cenário do chamado **antes** da mudança (idealmente com pbtrace).
- Aplicar o diff na branch, reproduzir de novo: o cenário não deve mais ocorrer.
- Anexar o trace "antes/depois" como evidência no card (estágio RESOLVIDO).

## Histórico de casos resolvidos

<!-- Referência rápida pra IA reconhecer padrões recorrentes. -->
- SMART-51845 — configuração de confirmação por e-mail no laboratório.
- (bug de recálculo de prazo de exame — transição de status do item da OS)
- (preencher os próximos)
