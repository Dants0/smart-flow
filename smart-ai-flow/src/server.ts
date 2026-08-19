// Precisa ser o primeiro import: carrega o .env antes de qualquer módulo
// (anthropic.ts, traceService.ts, jiraService.ts) ler process.env no top-level.
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { routes } from './http/routes';

// bodyLimit maior que o default (1MB) porque cards podem carregar
// screenshots em base64 e logs de trace anexados.
const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 });
app.register(cors, { origin: true });
app.register(routes);

const port = Number(process.env.PORT ?? 3333);
app.listen({ port, host: '0.0.0.0' }).catch((e) => {
  app.log.error(e);
  process.exit(1);
});
