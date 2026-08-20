-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "appliedBackupDir" TEXT,
ADD COLUMN     "appliedFiles" JSONB;
