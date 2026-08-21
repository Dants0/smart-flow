# Sistema: SMART Desktop

> Este arquivo é o briefing que a IA recebe em toda análise/proposta de card do
> SMART Desktop. Ele cobre o que vale para o **sistema inteiro**; logo abaixo
> dele, no mesmo prompt, vem o briefing de cada módulo acoplado (ATENDE,
> AGENDA, MWSUS, CADGF, CONSULT). Trate como documento vivo: cada bug bem resolvido vira
> uma linha nova aqui.

## O que é

Sistema desktop em **PowerBuilder / PFC**, entregue como um executável único
que acopla os módulos. O chamado costuma chegar nomeando a tela, não o módulo —
por isso o card não pergunta qual módulo é: identificar isso faz parte da
análise.

## Como descobrir o módulo a partir do chamado

Use os briefings abaixo. Na dúvida, os atalhos que costumam denunciar a origem:

| Pista no chamado | Provável módulo |
|---|---|
| paciente, ordem de serviço (OS), fila de espera, documentos da OS | ATENDE |
| marcação, horário, escala, sala, agendamento | AGENDA |
| SUS, BPA, APAC, faturamento SUS | MWSUS |
| cadastro geral, convênio, tabela de preço, parâmetros | CADGF |

Quando a pista não fecha, diga na análise **qual módulo você assumiu e por quê**
em vez de escolher em silêncio — errar o módulo em silêncio é o que faz a
proposta apontar objeto que não existe.

## Vale para todos os módulos

- **Dois bancos suportados: SQL Server (inclusive SQL Cloud) e Oracle.** Toda
  proposta que mexe em SQL precisa dizer o que acontece nos dois — divergência
  em `NULL`, tipos de data e `stored procedures` é a origem recorrente de
  regressão.
- **Comportamento parametrizado por INI.** Antes de propor mudança de código,
  verifique se o cenário não é um parâmetro (ex.: `CON_MED_FL`).
- **Objetos compartilhados são zona de risco.** `w_main_frame` e o que vive em
  `aplgen50` são usados por todos os módulos: mudança ali sai do escopo do
  chamado e derruba o sistema inteiro. Se a correção parecer exigir isso,
  aponte o risco explicitamente em vez de propor direto.
- **PFC.** Herança e ancestrais próprios do framework: sobrescrever evento sem
  chamar o ancestral quebra comportamento padrão de forma difícil de rastrear.

## O que se altera (e o que nunca se altera)

O código versionado são os **fontes exportados**: `.sru`, `.sra`, `.srd`, `.srw`,
que vivem em `ws_objects/<lib>/<lib>.pbl.src/`. São os únicos arquivos que uma
correção altera e os únicos que entram num commit.

`.pbl`, `.pbw` e `.pbd` são artefatos de build do PowerBuilder: aparecem
modificados no working copy só por efeito de compilar, e **nunca** sobem. Diff
que os toque é recusado pela plataforma.

## A mensagem da tela quase nunca está literal no código

**Regra geral, e a armadilha mais cara deste codebase.** O texto que o usuário vê
costuma ser montado em tempo de execução, a partir de variáveis:

```powerbuilder
sMsgAlt = "Este paciente está registrado no sistema como " + sStatus + "."
...
IF MessageBox ( "Atenção" + sAddTit, sMsgAlt + " ~n" + "Deseja prosseguir? " + sObs, Question!, YesNo!, 2 ) = 1 THEN
```

Consequências práticas:

1. **Procurar a frase inteira do print não acha o código.** "Este paciente está
   registrado no sistema como Óbito. Deseja prosseguir?" não existe em lugar
   nenhum: `Óbito` vem de um `CHOOSE CASE` que traduz o código do banco (`'O'`),
   e o "Deseja prosseguir?" é concatenado só na chamada.
2. **Pior: a frase parcial acha o lugar ERRADO.** "Este paciente está registrado
   no sistema como Óbito." aparece hardcoded em `agenda50`
   (`w_consagd_med.srw`, `m_sheet.srm`, `u_nv_agd_integra_sus.sru`) — cópias
   independentes que **não** são as que disparam nas telas de MWSUS/ATENDE.
   Concluir pela busca textual leva a analisar o módulo errado.
3. **O que funciona**: procurar o **prefixo literal** que sobreviveu à
   concatenação (`"registrado no sistema como "`), o nome das variáveis
   (`sMsgAlt`, `sStatus`, `sObs`) e a função que monta a mensagem — e depois
   confirmar **quem chama** aquele objeto na tela do chamado.

Antes de afirmar "o MessageBox está em X", confirme que X é alcançado pela tela
do chamado. Texto igual em dois lugares é comum aqui.

## Validação de paciente: `uof_testar_status` e as duas flags

`u_dw_pac` (`ws_objects/aplgen50/aplg50_2/aplg50_2.pbl.src/u_dw_pac.sru`) é o
user object de DataWindow de paciente usado pelas telas (normalmente como
`dw_pac01tab`). Ele centraliza os alertas — aniversário, hemodiálise, plano
suspenso, pendência, VIP e **óbito**.

**`uof_testar_status(p_nPacReg)`** (corpo na linha ~1903) devolve `BOOLEAN`:

- lê `pac_pront_status` e traduz o código do banco num rótulo por `CHOOSE CASE`
  (`'O'` → `Óbito`, `'T'` → `Alta`, `'I'` → `Inativo`, `'P'` → `Pendente`,
  `'R'` → `Alerta`, `'V'`/`pac_ind_vip = 'S'` → `VIP`);
- status sem alerta → **`RETURN TRUE`** logo no `CASE ELSE`;
- monta `sMsgAlt` (mensagem) e `sObs` (observação do prontuário, `pdc_obs`);
- **duas flags de instância, que fazem coisas diferentes**:
  - **`i_bAvancarObito`** (linha 35, default `TRUE`): quando `FALSE` e o status é
    Óbito, exibe só um alerta e **`RETURN FALSE`** — bloqueia sem perguntar;
  - com o default `TRUE`, cai no `MessageBox(..., Question!, YesNo!, 2)` e
    devolve `TRUE` para "Sim", `FALSE` para "Não" (o `2` deixa "Não" como botão
    padrão).

**O evento `avancar` de `u_dw_pac`** (linha ~2672) é quem transforma isso em
fluxo:

```powerbuilder
i_bavancar = TRUE
IF not This.uof_testar_status (0) THEN
    i_bavancar = FALSE
END IF
// ... outras validações (data de nascimento obrigatória etc.) também
// podem setar i_bavancar = FALSE
```

**O ancestral não interrompe nada sozinho.** Quem sobrescreve `avancar` na tela
precisa checar a flag logo depois do `call super::avancar`:

```powerbuilder
event avancar;call super::avancar;
IF NOT This.i_bAvancar THEN RETURN

// ... daqui pra baixo, o fluxo normal da tela
```

Tela que sobrescreve `avancar` e testa **só** `uof_get_pacreg()` ignora a
resposta do usuário **e todas as demais validações do ancestral** — o painel
seguinte abre de qualquer jeito. O padrão correto já é usado em ~19 objetos do
sistema (ex.: `w_consagd_med.srw`).

Antes de supor que existe uma função de validação por módulo: no SMART Desktop
essa validação é **centralizada no user object**, não replicada por tela.

## Evidência de execução

Chamado com log de **pbtrace** anexado é analisado antes pelo app_trace, e o
diagnóstico dele entra no prompt. Evidência de execução pesa mais que suposição
sobre o código — mas cruze com o resto do contexto antes de fechar a causa raiz.

<!-- preencher: convenções de nomenclatura de objetos, bibliotecas por módulo,
     e as armadilhas que se repetem entre módulos. -->
