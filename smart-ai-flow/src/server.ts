// Precisa ser o primeiro import: carrega o .env antes de qualquer módulo
// (llm.ts, traceService.ts, jiraService.ts) ler process.env no top-level.
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { routes } from './http/routes';
import { recoverOrphanJobs, startWorker } from './infra/jobQueue';

// bodyLimit maior que o default (1MB) porque cards podem carregar
// screenshots em base64 e logs de trace anexados.
const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 });

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 16) {
  app.log.error('JWT_SECRET ausente ou muito curto no .env (mínimo 16 caracteres).');
  process.exit(1);
}
if (!process.env.ENCRYPTION_KEY) {
  app.log.error('ENCRYPTION_KEY ausente no .env — necessária pra cifrar credenciais do Jira.');
  process.exit(1);
}

app.register(cors, { origin: true });
app.register(jwt, { secret: jwtSecret });
app.register(routes);

const port = Number(process.env.PORT ?? 3333);

async function main() {
  // Jobs que estavam RUNNING quando o processo caiu voltam pra fila — é o que
  // impede um card de ficar preso em ANALISE/DESENVOLVIMENTO para sempre.
  const recovered = await recoverOrphanJobs();
  if (recovered > 0) app.log.warn(`${recovered} job(s) órfão(s) recolocado(s) na fila`);

  startWorker((err) => app.log.error({ err }, 'falha no worker da fila'));

  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((e) => {
  app.log.error(e);
  process.exit(1);
});
