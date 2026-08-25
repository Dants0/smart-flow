-- O aviso passa a espelhar as colunas do quadro, não a categoria do Jira.
--
-- Pedido do dev: chamado em Revisão, Gerar Exe, Testes, Resolvidos, Homologação
-- e Entregue não é trabalho dele — não precisa aparecer no aviso.
--
-- `statusCategory != Done` não conseguia expressar isso. Lido da configuração
-- real do quadro 753 ("Kanban Faturamento/Internação - BUG´s"), a categoria não
-- acompanha a coluna: "Aguardando Versão Testes" (coluna Gerar Exe) e
-- "Homologação" são categoria **Pendências**, e "Deploy Devops" (coluna
-- Resolvidos) é **Em andamento**. Filtrar por categoria deixava os três passando.
--
-- Por id de status, e não por nome, de propósito: nome muda com renomeação e com
-- idioma da instância, e nome errado não filtra errado — derruba a consulta
-- inteira em HTTP 400, que chega ao dev como banner vazio ou 502.
--
--   FICAM DE FORA                        CONTINUAM APARECENDO
--   19653 Revisão de Código              19760 Novo
--   17600 Em revisão                     1     Criado
--   20403 Aguardando Versão Testes       10437 Em Análise
--   13141 Aguardando Testes              3     Em Andamento
--   19738 Em Teste                       12040 Em Desenvolvimento
--   19774 Deploy Devops                  19773 Rejeitado Cliente
--   13145 Resolvido                      19771 Impedimento
--   24901 Homologação
--   19772 Entregue
--   13144 Fechado
UPDATE "PlatformSettings"
   SET "jiraAssignedJql" = 'assignee = currentUser() AND status not in (19653, 17600, 20403, 13141, 19738, 19774, 13145, 24901, 19772, 13144) ORDER BY created DESC'
 WHERE "jiraAssignedJql" IN (
   'assignee = currentUser() AND statusCategory != Done ORDER BY created DESC',
   'assignee = currentUser() ORDER BY created DESC',
   'assignee = currentUser() AND resolution = Unresolved ORDER BY created DESC'
 );

ALTER TABLE "PlatformSettings"
  ALTER COLUMN "jiraAssignedJql" SET DEFAULT 'assignee = currentUser() AND status not in (19653, 17600, 20403, 13141, 19738, 19774, 13145, 24901, 19772, 13144) ORDER BY created DESC';
