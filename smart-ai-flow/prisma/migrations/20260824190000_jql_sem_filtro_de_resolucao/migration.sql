-- JQL de chamados atribuídos sem o filtro de resolução.
--
-- No Jira do time, "resolvido" e "situação" andam separados: o SMART-51229
-- estava EM DESENVOLVIMENTO com Resolução = Concluída, e o
-- `resolution = Unresolved` o escondia do board justamente enquanto ele ainda
-- era trabalho em aberto. Quem manda é o assignee, não o campo de resolução.
UPDATE "PlatformSettings"
   SET "jiraAssignedJql" = 'assignee = currentUser() ORDER BY created DESC'
 WHERE "jiraAssignedJql" = 'assignee = currentUser() AND resolution = Unresolved ORDER BY created DESC';

ALTER TABLE "PlatformSettings"
  ALTER COLUMN "jiraAssignedJql" SET DEFAULT 'assignee = currentUser() ORDER BY created DESC';
