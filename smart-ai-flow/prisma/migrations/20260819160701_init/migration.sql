-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('NOVO', 'ANALISE', 'DESENVOLVIMENTO', 'REVISAO', 'RESOLVIDO', 'ERRO');

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "rawTicket" TEXT NOT NULL,
    "branch" TEXT,
    "stage" "Stage" NOT NULL DEFAULT 'NOVO',
    "analysis" JSONB,
    "proposal" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "History" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "from" "Stage" NOT NULL,
    "to" "Stage" NOT NULL,
    "by" TEXT NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "History_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "stage" "Stage" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Card_module_stage_idx" ON "Card"("module", "stage");

-- AddForeignKey
ALTER TABLE "History" ADD CONSTRAINT "History_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
