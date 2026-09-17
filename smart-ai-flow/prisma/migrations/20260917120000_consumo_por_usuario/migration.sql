-- Consumo de IA por usuário: o painel do Monitor de Recursos somava a plataforma
-- inteira para qualquer dev que abrisse a tela.
ALTER TABLE "Run" ADD COLUMN "userId" TEXT;

-- Histórico: o gasto é de quem criou o card. Chat antigo não guardava quem
-- perguntou, então vai pro dono do card também (é quase sempre a mesma pessoa).
UPDATE "Run" r SET "userId" = c."createdById" FROM "Card" c WHERE r."cardId" = c."id";

ALTER TABLE "Run" ADD CONSTRAINT "Run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Run_userId_at_idx" ON "Run"("userId", "at");
