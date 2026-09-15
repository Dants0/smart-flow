# O backend não alcançava o banco: o container do Postgres ficou fora da rede

- **Data:** 2026-09-15
- **Solicitação:** "toda vez que rodo o container do backend acontece a mesma coisa, ajuste isso! `Error: P1001: Can't reach database server at db:5432`"
- **Status:** concluído

## O que estava acontecendo

Duas coisas somadas — uma que travava o ambiente agora, outra que fazia o erro
se repetir na tela em vez de aparecer uma vez só.

**1. O container do `db` estava sem rede nenhuma.** Ele tinha sido criado em
02/09 e sobreviveu a recriações do stack: o `docker compose ps` mostrava
`Up (healthy)`, mas sem porta publicada, e o `inspect` era categórico:

```
docker inspect smart-ai-flow-db-1 --format '{{json .NetworkSettings.Networks}}'
{}
```

`HostConfig.NetworkMode` continuava `smart-ai-flow_default`, e a rede existia —
só que com `web`, `trace-api` e `pb-insight` dentro, sem o `db`. A rede foi
recriada em algum ciclo do compose e o container antigo, mantido de pé pelo
`restart: unless-stopped`, nunca reentrou nela. Daí o P1001: não era o Postgres
que estava fora do ar, era o nome `db` que não resolvia para lugar nenhum.

**2. O CMD do backend não esperava o banco.** Era
`sh -c "npx prisma migrate deploy && npx tsx src/server.ts"`: o migrate falhava,
o container saía, o `restart: unless-stopped` subia de novo, e o mesmo bloco de
erro era reimpresso em loop — exatamente como veio colado na solicitação, três
vezes seguidas.

E o `depends_on: service_healthy` não protegia disso: o healthcheck era
`pg_isready -U smart -d smart_ai_flow`, **sem `-h`**, que testa o socket Unix. No
bootstrap a imagem do Postgres sobe um servidor temporário com
`listen_addresses=''` — o socket já responde enquanto a porta 5432 ainda está
fechada para a rede. O compose dava o banco como saudável e liberava o backend
cedo demais.

## O que foi feito

- **Healthcheck do Postgres passou a testar TCP** (`pg_isready -h 127.0.0.1`),
  com `retries: 20` e `start_period: 30s`. Agora "healthy" significa a porta que
  o backend usa, não o socket local. Vale nos dois compose (raiz e o de dev).
- **`smart-ai-flow/docker-entrypoint.sh`** substituiu o `sh -c` do CMD: espera o
  banco, migra com retry e só então executa o servidor (`exec`, para o Node
  receber os sinais e o container parar direito).
- **`smart-ai-flow/scripts/wait-for-db.mjs`**: espera a porta da `DATABASE_URL`
  aceitar conexão, até 120s. Node puro, sem `pg_isready` dentro da imagem Alpine.
  No caminho feliz não imprime nada.
- **`.gitattributes`** fixa `*.sh` e `*.mjs` em LF. O `core.autocrlf` desta
  máquina é `true`, e um entrypoint em CRLF viraria um shebang `/bin/sh` + CR —
  container que não sobe. O Dockerfile ainda roda um `sed -i "s/\r$//"` antes do
  `chmod +x`, para os clones que já estão com CRLF no disco.

O container órfão em si se resolveu com `docker compose up -d --build`, que
recriou o `db` (e junto aplicou a seção de portas do `.env`, que o container de
02/09 não tinha). Os dados estavam no volume nomeado `smart-ai-flow_pgdata` e
foram preservados.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `docker-compose.yml` | healthcheck do `db` via TCP, `retries: 20`, `start_period: 30s` |
| `smart-ai-flow/docker-compose.yml` | mesmo healthcheck, no compose de dev |
| `smart-ai-flow/Dockerfile` | CMD passa a ser `./docker-entrypoint.sh`; normaliza CRLF e dá `chmod +x` |
| `smart-ai-flow/docker-entrypoint.sh` | novo — espera o banco, migra com retry, sobe o servidor |
| `smart-ai-flow/scripts/wait-for-db.mjs` | novo — espera a porta da `DATABASE_URL` |
| `.gitattributes` | novo — `*.sh` e `*.mjs` sempre em LF |

## Decisões

- **Retry no migrate, além da espera pela porta.** Porta aberta não é banco
  pronto: o Postgres ainda recusa as primeiras conexões com "the database system
  is starting up", e isso também sai como P1001. São 10 tentativas com 3s
  (`DB_MIGRATE_ATTEMPTS` ajusta), e depois disso ele desiste com mensagem própria
  em vez de reiniciar em loop.
- **A espera ficou no entrypoint, não no compose.** O healthcheck corrigido já
  resolve o caso normal; a espera é rede de segurança para quem sobe o backend
  sozinho, contra um banco ainda inicializando ou restaurando volume.
- **Recriar o `db` foi necessário.** Não havia como reatar o container à rede
  sem recriá-lo; o volume nomeado garantiu que nada fosse perdido.

## Verificação

`docker compose up -d --build` — stack inteira recriada, `db` saudável **e** na
rede, backend `Up` sem reinício:

| | resultado |
|---|---|
| `docker compose ps` | 5 serviços `Up`, `db` `(healthy)` e com `0.0.0.0:5432->5432` |
| log do backend | `22 migrations found` · `No pending migrations to apply.` · `Server listening at http://0.0.0.0:3333` |
| `GET /auth/status` | `200` — `{"needsBootstrap":false}` |
| `GET /cards` sem token | `401` (a regra de `2026-09-14-01` continua de pé) |
| `select count(*) from "Card"` | **6** — os mesmos cards de antes |
| `docker compose restart backend` | sobe limpo, sem P1001 |

## Pendências

- **O órfão de rede pode voltar se um container for mantido enquanto a rede é
  recriada.** O sintoma agora é legível (o `wait-for-db` diz qual host:porta não
  respondeu e manda olhar `docker compose logs db`), mas a cura continua sendo
  `docker compose up -d`, que reconcilia tudo — e não `docker start backend`.
- Continuam valendo as pendências de `2026-09-14-01` e `2026-08-28-03`.
