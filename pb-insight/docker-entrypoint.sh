#!/bin/sh
# O servidor carrega .data/graph.json na subida e morre se não existir. Numa
# instalação nova esse arquivo ainda não foi gerado (vem do `npm run ingest`,
# que precisa do repositório do SMART Desktop) — e o container entraria em
# crash-loop antes de o usuário ter chance de indexar.
#
# Com um grafo vazio ele sobe, responde /health e a busca simplesmente não
# acha nada. A plataforma trata isso: o card mostra "análise sem contexto de
# código". Rodar o ingest depois substitui este arquivo.
set -e

if [ ! -f .data/graph.json ]; then
  echo "[pb-insight] .data/graph.json não encontrado — subindo com índice vazio."
  echo "[pb-insight] Para indexar o codebase:  docker compose exec pb-insight npm run ingest"
  mkdir -p .data
  # `objects` e `dependencies` são obrigatórios: JsonObjectRepository.index()
  # itera os dois na carga e quebra se algum vier ausente.
  echo '{"version":{"id":"empty","label":"sem indice","ingestedAt":"1970-01-01T00:00:00.000Z","sourceHash":"","objectCount":0},"objects":[],"dependencies":[]}' > .data/graph.json
fi

exec "$@"
