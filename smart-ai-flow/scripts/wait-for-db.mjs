// Espera o Postgres da DATABASE_URL aceitar conexão antes de qualquer comando
// do Prisma.
//
// Por que isso é necessário mesmo com `depends_on: service_healthy`: o
// healthcheck do compose usa `pg_isready`, e durante o bootstrap a imagem do
// Postgres sobe um servidor temporário que escuta SÓ no socket Unix
// (listen_addresses=''). O pg_isready local responde "aceitando conexões"
// enquanto a porta 5432 ainda está fechada pra rede — e o backend, liberado
// cedo demais, morria com P1001 e reiniciava em loop (restart: unless-stopped).
//
// O healthcheck do compose já foi corrigido pra testar via TCP; esta espera
// fica como rede de segurança para quem sobe o backend contra um banco que
// ainda está inicializando (primeiro `up`, restauração de volume, etc).
import net from 'node:net';

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error('[wait-for-db] DATABASE_URL não definida.');
  process.exit(1);
}

const url = new URL(raw);
const host = url.hostname;
const port = Number(url.port || 5432);
const timeoutMs = Number(process.env.DB_WAIT_TIMEOUT_MS || 120_000);
const intervalMs = 1_000;

const canConnect = () =>
  new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(3_000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const deadline = Date.now() + timeoutMs;
let attempt = 0;

while (Date.now() < deadline) {
  if (await canConnect()) {
    if (attempt > 0) console.log(`[wait-for-db] ${host}:${port} respondeu.`);
    process.exit(0);
  }
  // Só avisa a partir da segunda tentativa: no caminho feliz o banco já está
  // de pé e o script não imprime nada.
  if (attempt === 1) console.log(`[wait-for-db] aguardando ${host}:${port}...`);
  attempt += 1;
  await sleep(intervalMs);
}

console.error(
  `[wait-for-db] ${host}:${port} não respondeu em ${Math.round(timeoutMs / 1000)}s. ` +
    'O serviço `db` subiu? Veja `docker compose logs db`.',
);
process.exit(1);
