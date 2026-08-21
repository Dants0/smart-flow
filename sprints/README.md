# Sprints

Registro do que foi feito em cada solicitação ao assistente. Um arquivo por
solicitação, criado ao final do atendimento.

## Convenção

- Nome do arquivo: `YYYY-MM-DD-NN-slug.md` (`NN` = sequência do dia, começando em `01`).
- A data é a do **trabalho**, não a da escrita — registros retroativos usam a data
  do commit e trazem uma nota dizendo que foram reconstruídos do histórico git.
- Idioma: português.
- Escopo: o que foi **realizado**, não o que se pretende fazer.

## Índice

| Registro | Assunto |
|---|---|
| [2026-08-19-01](2026-08-19-01-fase-1-monorepo-e-esteira-base.md) | Fase 1 — monorepo e esteira base |
| [2026-08-19-02](2026-08-19-02-fase-2-configuracao-pela-interface.md) | Fase 2 — configuração pela interface |
| [2026-08-20-01](2026-08-20-01-fase-3-multiusuario-fila-e-docker.md) | Fase 3 — multiusuário, fila de jobs e Docker |
| [2026-08-20-02](2026-08-20-02-fase-4-rede-do-compose-e-monitor.md) | Fase 4 — rede do compose e monitor |
| [2026-08-20-03](2026-08-20-03-documentacao-de-sprints.md) | Convenção de documentação por solicitação |
| [2026-08-20-04](2026-08-20-04-documentacao-retroativa-fases-1-a-4.md) | Documentação retroativa das fases 1 a 4 |
| [2026-08-20-05](2026-08-20-05-secao-skills-nas-configuracoes-de-ia.md) | Seção SKILLS nas configurações de IA |
| [2026-08-20-06](2026-08-20-06-sistema-no-card-e-aplicacao-do-diff.md) | Sistema no card e aplicação do diff pela IA |
| [2026-08-20-07](2026-08-20-07-disjuntor-de-autenticacao-do-jira.md) | Disjuntor de autenticação do Jira (CAPTCHA) |
| [2026-08-20-08](2026-08-20-08-falhas-de-json-na-analise.md) | Falhas de JSON na análise (resposta cortada) |
| [2026-08-20-09](2026-08-20-09-ajuda-de-conexao-com-o-jira.md) | Ajuda de conexão com o Jira |
| [2026-08-20-10](2026-08-20-10-testar-conexao-com-o-jira.md) | Botão "Testar conexão" do Jira |
| [2026-08-20-11](2026-08-20-11-esc-e-pagina-inteira-do-card.md) | Esc fecha o painel e página inteira do card |
| [2026-08-20-12](2026-08-20-12-abrir-card-em-nova-aba-pelo-board.md) | Abrir o card em nova aba direto do board |
| [2026-08-20-13](2026-08-20-13-regra-de-commit-e-guarda-de-artefatos.md) | Regra de commit do SMART Desktop e guarda de artefatos |
| [2026-08-20-14](2026-08-20-14-esteira-de-versionamento.md) | Esteira de Versionamento (commit, PR e comentário no Jira) |
| [2026-08-21-01](2026-08-21-01-guardas-contra-proposta-inventada.md) | Guardas contra proposta inventada (SMART-50927) |
| [2026-08-21-02](2026-08-21-02-template-do-jira-dois-repositorios-e-roteamento.md) | Template do Jira, dois repositórios e roteamento de sistema |
| [2026-08-21-03](2026-08-21-03-claude-md-do-backend.md) | CLAUDE.md do backend atualizado |
| [2026-08-21-04](2026-08-21-04-buscar-codigo-real-em-vez-de-parar.md) | Buscar o código real em vez de parar (gate de material) |
| [2026-08-21-05](2026-08-21-05-chamado-e-prints-como-contexto.md) | Chamado e prints como contexto de busca |
| [2026-08-21-06](2026-08-21-06-revisao-em-blocos-e-chat.md) | Revisão em blocos e chat de dúvidas |
| [2026-08-21-07](2026-08-21-07-fluxo-de-aceite-e-material-do-proposer.md) | Fluxo de aceite explícito e material do proposer corrigido |
| [2026-08-21-08](2026-08-21-08-aceitar-aplica-o-codigo.md) | Aceitar aplica o código, e o caminho para o Auto Mode |
| [2026-08-21-09](2026-08-21-09-bloco-inteiro-em-vez-de-janela-fixa.md) | Código truncado: bloco inteiro em vez de janela fixa |
| [2026-08-21-10](2026-08-21-10-mensagem-montada-e-corrente-do-codigo.md) | Mensagem montada em runtime e a corrente do código |
| [2026-08-21-11](2026-08-21-11-direcionamento-do-dev-na-criacao.md) | Direcionamento do dev na criação do card |

## Template

```markdown
# <título curto da solicitação>

- **Data:** YYYY-MM-DD
- **Solicitação:** <o pedido do usuário, em uma frase>
- **Status:** concluído | parcial | bloqueado

## O que foi feito
<lista objetiva das mudanças, na ordem em que aconteceram>

## Arquivos alterados
| Arquivo | Mudança |
|---|---|

## Decisões
<escolhas relevantes e o porquê; premissas assumidas>

## Pendências
<o que ficou de fora e por quê — "nenhuma" se não houver>
```
