-- DropForeignKey
ALTER TABLE "History" DROP CONSTRAINT "History_cardId_fkey";

-- DropForeignKey
ALTER TABLE "Run" DROP CONSTRAINT "Run_cardId_fkey";

-- AddForeignKey
ALTER TABLE "History" ADD CONSTRAINT "History_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
