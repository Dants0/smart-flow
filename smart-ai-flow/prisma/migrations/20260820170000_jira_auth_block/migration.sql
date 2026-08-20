-- AlterTable
ALTER TABLE "User" ADD COLUMN     "jiraAuthBlockedAt" TIMESTAMP(3),
ADD COLUMN     "jiraAuthBlockedReason" TEXT;
