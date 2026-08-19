-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "anthropicApiKey" TEXT,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "aiProvider" TEXT NOT NULL DEFAULT 'anthropic',
    "openaiApiKey" TEXT,
    "openaiModel" TEXT NOT NULL DEFAULT 'gpt-4o',
    "traceServiceUrl" TEXT NOT NULL DEFAULT 'http://localhost:8070',
    "jiraBaseUrl" TEXT,
    "jiraUser" TEXT,
    "jiraPassword" TEXT,
    "jiraAssignedJql" TEXT NOT NULL DEFAULT 'assignee = currentUser() AND resolution = Unresolved ORDER BY created DESC',
    "pbInsightUrl" TEXT NOT NULL DEFAULT 'http://127.0.0.1:4500',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);
