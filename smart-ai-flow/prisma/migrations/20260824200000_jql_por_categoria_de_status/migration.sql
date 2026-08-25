-- A JQL passa a filtrar por CATEGORIA DE SITUAÇÃO, não por resolução.
--
-- Medido na instância do time (85 chamados atribuídos ao dev):
--
--   assignee = currentUser()                          -> 85  (banner com 18 avisos)
--   assignee = currentUser() AND statusCategory != Done ->  4
--   assignee = currentUser() AND resolution = Unresolved ->  2  (escondia trabalho aberto)
--
-- O campo `resolution` não acompanha a situação: o SMART-51229 está
-- "Em Desenvolvimento" com resolução "Concluída". Já `statusCategory` é campo
-- de sistema com três valores (To Do / In Progress / Done), independente dos
-- nomes de status do workflow — os 4 que sobram são exatamente as colunas
-- DESENVOLVIMENTO + GERAR EXE do quadro.
UPDATE "PlatformSettings"
   SET "jiraAssignedJql" = 'assignee = currentUser() AND statusCategory != Done ORDER BY created DESC'
 WHERE "jiraAssignedJql" IN (
   'assignee = currentUser() ORDER BY created DESC',
   'assignee = currentUser() AND resolution = Unresolved ORDER BY created DESC',
   -- Tentativa manual salva pela tela de Configurações que o Jira recusa com
   -- HTTP 400 ("O valor 'unresolved' não existe para o campo 'status'") e que
   -- derrubava o banner em 502. Sai junto, senão o ambiente segue quebrado.
   'assignee = currentUser() AND status = "unresolved" ORDER BY created DESC'
 );

ALTER TABLE "PlatformSettings"
  ALTER COLUMN "jiraAssignedJql" SET DEFAULT 'assignee = currentUser() AND statusCategory != Done ORDER BY created DESC';
