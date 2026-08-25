-- Segunda identidade do Bitbucket.
--
-- O API token da Atlassian (que substituiu a app password) exige metades
-- diferentes no Basic Auth: username para o git push, e-mail da conta Atlassian
-- para a API REST 2.0. O campo único `bitbucketUser` atendia os dois enquanto a
-- credencial era app password.
--
-- Nullable de propósito: quem já tem app password configurada continua
-- funcionando sem preencher nada.
ALTER TABLE "User" ADD COLUMN "bitbucketEmail" TEXT;
