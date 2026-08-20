# Ajuda de conexão com o Jira

- **Data:** 2026-08-20
- **Solicitação:** "símbolo de ajuda caso o dev esteja com dificuldade para conectar no Jira, o passo a passo do que deve ser feito para corrigir"
- **Status:** concluído

## O que foi feito
1. **`components/HelpTip.tsx`** (novo): botão de ajuda reutilizável — ícone de
   interrogação + rótulo "Ajuda", que abre um painel ancorado. Fecha com **Esc**
   e ao clicar fora; tem `aria-label` e `aria-expanded` (ícone sozinho não diz a
   um leitor de tela do que é a ajuda).
2. **`components/JiraTroubleshooting.tsx`** (novo): o passo a passo, em quatro
   blocos — o básico (usuário/senha do Jira, espaço colado, senha trocada
   recentemente, URL da instância); destravar o CAPTCHA; travou de novo; e
   "conectou mas não aparece chamado".
3. **Onde aparece**: ao lado do título **"Minhas credenciais do Jira"** em
   Configurações → Minha conta, e dentro do **banner de bloqueio no board**.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `web/components/HelpTip.tsx` | novo |
| `web/components/JiraTroubleshooting.tsx` | novo |
| `web/app/settings/account/page.tsx` | ajuda no grupo de credenciais |
| `web/components/JiraBlockedBanner.tsx` | ajuda no banner |

## Decisões
- **A ordem dos passos é a correção.** "Feche a aba do board" vem primeiro: o
  polling de 60s rearma o CAPTCHA e faz o resto do procedimento não segurar. Foi
  exatamente o loop em que o dev caiu — instrução em ordem errada aqui não é
  detalhe de redação, é o que decide se funciona.
- **Duas portas para o mesmo texto.** Quem está travado lê o banner do board,
  não a tela de conta; quem está configurando pela primeira vez está na tela de
  conta. Mesmo componente nos dois lugares, sem texto duplicado pra sair de sincronia.
- **Ajuda visível antes do erro.** Instrução que só aparece quando falha chega
  tarde: o dev novo precisa achar o procedimento na tela onde configura.
- **Inclui o atalho de administrador** (`Reset Failed Login Count` no
  gerenciamento de usuários do Jira) — resolve na hora quem tem o acesso.
- **Explica por que a senha importa aqui**: a plataforma autentica com a
  credencial do dev a cada consulta, então senha desatualizada não é só "não
  funciona", é o que trava a conta dele no Jira.

## Verificação
- `tsc --noEmit`, `eslint` e `npm run build` (web): limpos.
- Container `web` reconstruído; `/settings/account` respondendo 200.
- **Não abri a tela no navegador** — não conferi visualmente o posicionamento do
  painel nem o comportamento de fechar com Esc/clique fora.

## Pendências
- A ajuda cobre o Jira. PB Insight e app_trace não têm equivalente; o Monitor de
  Recursos mostra o status deles, mas não o que fazer quando estão fora.
- Não existe um "Testar conexão" na tela de conta: hoje o dev salva e descobre
  se funcionou quando o board consulta. Um botão de teste daria resposta na
  hora — dá pra fazer, é só pedir.
