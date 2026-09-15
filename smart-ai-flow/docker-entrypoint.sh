#!/bin/sh
# Start do backend em container: espera o banco, migra e sobe o servidor.
#
# Antes isto era um `sh -c "npx prisma migrate deploy && npx tsx src/server.ts"`
# direto no CMD. Quando o Postgres ainda não estava aceitando conexões, o
# migrate morria com P1001, o container saía e o `restart: unless-stopped`
# repetia tudo — daí o mesmo erro impresso várias vezes a cada `up`.
set -e

node scripts/wait-for-db.mjs

# Mesmo com a porta aberta o Postgres pode recusar as primeiras conexões
# ("the database system is starting up"), então o migrate também tem retry.
attempt=1
max_attempts=${DB_MIGRATE_ATTEMPTS:-10}
until npx prisma migrate deploy; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[entrypoint] migrate deploy falhou após $max_attempts tentativas." >&2
    exit 1
  fi
  echo "[entrypoint] migrate deploy falhou (tentativa $attempt/$max_attempts); nova tentativa em 3s..." >&2
  attempt=$((attempt + 1))
  sleep 3
done

exec npx tsx src/server.ts
