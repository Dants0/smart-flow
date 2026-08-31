-- Espera agendada na fila: 429 de limite de uso deixa de mandar o card pra ERRO
-- e passa a reagendar o job. `availableAt` é quando o worker pode voltar a pegá-lo;
-- `deferrals` conta essas esperas à parte de `attempts` (que é orçamento de falha real).
ALTER TABLE "Job" ADD COLUMN "availableAt" TIMESTAMP(3);
ALTER TABLE "Job" ADD COLUMN "deferrals" INTEGER NOT NULL DEFAULT 0;

-- O claim filtra por status + disponibilidade; sem o índice ele varre a fila inteira.
CREATE INDEX "Job_status_availableAt_createdAt_idx" ON "Job"("status", "availableAt", "createdAt");
