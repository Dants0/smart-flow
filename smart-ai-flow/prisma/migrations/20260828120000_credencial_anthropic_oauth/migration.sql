-- A conta corporativa da Anthropic deixou de emitir chave de API: agora a
-- credencial é um token OAuth (o mesmo `CLAUDE_CODE_OAUTH_TOKEN` do Claude
-- Code). Os dois viajam em headers diferentes — `x-api-key` para a chave,
-- `Authorization: Bearer` + `anthropic-beta: oauth-2025-04-20` para o token —
-- então o backend precisa saber QUAL dos dois está guardado.
--
-- A coluna passa a guardar a credencial ativa, seja qual for o tipo, e o tipo
-- vira uma coluna própria. O RENAME preserva o que já está gravado: tudo que
-- existia até aqui era chave de API, que é o default do tipo novo.
ALTER TABLE "PlatformSettings" RENAME COLUMN "anthropicApiKey" TO "anthropicCredential";
ALTER TABLE "PlatformSettings" ADD COLUMN "anthropicAuthType" TEXT NOT NULL DEFAULT 'apiKey';
