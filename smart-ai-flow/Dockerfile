FROM node:22-alpine
WORKDIR /app

# openssl: exigido pelo engine do Prisma no Alpine.
# patch: aplica o diff da proposta no working copy (ver src/infra/workspace.ts).
#        O GNU patch tolera deslocamento de contexto, que é o caso comum num
#        diff gerado por LLM — git apply recusaria o mesmo diff.
# git: commit/push da branch do chamado (ver src/infra/git.ts).
RUN apk add --no-cache openssl patch git

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

# Roda via tsx, não via `tsc` + node: o código usa imports ESM sem extensão
# `.js`, que o Node não resolve sozinho. Converter exigiria reescrever os
# imports de todos os arquivos — tsx resolve isso e é o que o projeto já usa
# em dev (e o pb-insight em produção).
EXPOSE 3333
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/server.ts"]
