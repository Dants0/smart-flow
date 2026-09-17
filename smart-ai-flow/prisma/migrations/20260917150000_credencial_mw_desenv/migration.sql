-- Credencial do MW desenv por usuário, validada contra a tabela usr do MW20.
ALTER TABLE "User" ADD COLUMN "mwUser" TEXT;
ALTER TABLE "User" ADD COLUMN "mwPasswordEnc" TEXT;
ALTER TABLE "User" ADD COLUMN "mwValidatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "mwValidationError" TEXT;

-- Conexão ao banco MW20 (global, configurada pelo admin).
ALTER TABLE "PlatformSettings" ADD COLUMN "mw20Engine" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "mw20Host" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "mw20Port" INTEGER;
ALTER TABLE "PlatformSettings" ADD COLUMN "mw20Database" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "mw20User" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "mw20PasswordEnc" TEXT;
