-- AlterEnum
ALTER TYPE "Stage" ADD VALUE 'VERSIONAMENTO' BEFORE 'RESOLVIDO';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gitName" TEXT,
ADD COLUMN     "gitEmail" TEXT,
ADD COLUMN     "bitbucketUser" TEXT,
ADD COLUMN     "bitbucketAppPasswordEnc" TEXT;

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "branch" TEXT,
ADD COLUMN     "commitHash" TEXT,
ADD COLUMN     "committedFiles" JSONB,
ADD COLUMN     "prUrl" TEXT,
ADD COLUMN     "jiraCommentAt" TIMESTAMP(3);
