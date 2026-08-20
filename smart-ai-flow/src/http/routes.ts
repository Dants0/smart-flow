import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createCard } from '../domain/card';
import { resolve, requestNewProposal, retryFromError } from '../orchestrator/orchestrator';
import { fetchJiraIssue, searchAssignedIssues } from '../infra/jiraService';
import {
  findAllJiraKeys,
  findCardById,
  findCardSummaries,
  findUsedModules,
  saveCard,
  deleteCard as deleteCardRow,
  type CardFilters,
} from '../infra/cardRepository';
import { getSettings, updateSettings } from '../infra/settingsRepository';
import { promoteResolvedTicket } from '../infra/pbInsight';
import { checkResources } from '../infra/monitor';
import { enqueueAdvance, queueStats } from '../infra/jobQueue';
import { usageSummary } from '../infra/runRepository';
import {
  authenticate,
  countUsers,
  createUser,
  deleteUser,
  dismissIssue,
  findUserById,
  listDismissed,
  listUsers,
  updateUser,
} from '../infra/userRepository';
import {
  CreateCardSchema,
  CreateUserSchema,
  LoginSchema,
  RejectCardSchema,
  ResolveCardSchema,
  RetryCardSchema,
  UpdateMeSchema,
  UpdateSettingsSchema,
  formatZodError,
} from './schemas';

/**
 * Rotas da esteira. Tudo autenticado por JWT, exceto /auth/login e /auth/bootstrap.
 * O pipeline de IA não roda mais dentro do request: POST /cards enfileira um Job
 * e responde na hora (ver infra/jobQueue.ts).
 */

/** Valida o corpo com Zod e responde 400 legível em vez de estourar 500. */
function parseBody<T>(schema: z.ZodType<T>, req: FastifyRequest, reply: FastifyReply): T | null {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    reply.code(400).send({ error: formatZodError(result.error) });
    return null;
  }
  return result.data;
}

function currentUserId(req: FastifyRequest): string {
  return (req.user as { sub: string }).sub;
}

export async function routes(app: FastifyInstance) {
  // ---- Autenticação -----------------------------------------------------

  /** Primeiro acesso: cria o admin inicial. Fecha assim que existir 1 usuário. */
  app.post('/auth/bootstrap', async (req, reply) => {
    if ((await countUsers()) > 0) {
      return reply.code(409).send({ error: 'a plataforma já tem usuários — use o login.' });
    }
    const body = parseBody(CreateUserSchema, req, reply);
    if (!body) return;

    const user = await createUser({ ...body, isAdmin: true });
    return reply.code(201).send(user);
  });

  /** Diz ao front se ainda precisa criar o primeiro usuário. Único endpoint público além do login. */
  app.get('/auth/status', async () => {
    return { needsBootstrap: (await countUsers()) === 0 };
  });

  app.post('/auth/login', async (req, reply) => {
    const body = parseBody(LoginSchema, req, reply);
    if (!body) return;

    const user = await authenticate(body.username, body.password);
    if (!user) return reply.code(401).send({ error: 'usuário ou senha inválidos' });

    const token = app.jwt.sign({ sub: user.id, username: user.username }, { expiresIn: '12h' });
    return { token, user };
  });

  // ---- Daqui pra baixo, tudo exige token --------------------------------

  app.register(async (secured) => {
    secured.addHook('onRequest', async (req, reply) => {
      try {
        await req.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'não autenticado' });
      }
    });

    secured.get('/me', async (req, reply) => {
      const user = await findUserById(currentUserId(req));
      if (!user) return reply.code(401).send({ error: 'usuário não existe mais' });
      return user;
    });

    /** Perfil + credenciais pessoais do Jira (a senha é cifrada antes de salvar). */
    secured.patch('/me', async (req, reply) => {
      const body = parseBody(UpdateMeSchema, req, reply);
      if (!body) return;
      return updateUser(currentUserId(req), body);
    });

    secured.get('/users', async (req, reply) => {
      const me = await findUserById(currentUserId(req));
      if (!me?.isAdmin) return reply.code(403).send({ error: 'só admin' });
      return listUsers();
    });

    secured.post('/users', async (req, reply) => {
      const me = await findUserById(currentUserId(req));
      if (!me?.isAdmin) return reply.code(403).send({ error: 'só admin' });
      const body = parseBody(CreateUserSchema, req, reply);
      if (!body) return;
      try {
        // A senha vai por canal externo (chat/e-mail); a plataforma cobra a troca no 1º acesso.
        return reply.code(201).send(await createUser({ ...body, mustChangePassword: true }));
      } catch {
        return reply.code(409).send({ error: 'nome de usuário já existe' });
      }
    });

    secured.delete('/users/:id', async (req, reply) => {
      const me = await findUserById(currentUserId(req));
      if (!me?.isAdmin) return reply.code(403).send({ error: 'só admin' });
      const id = (req.params as { id: string }).id;
      if (id === me.id) return reply.code(400).send({ error: 'não dá pra apagar a si mesmo' });
      const ok = await deleteUser(id);
      if (!ok) return reply.code(404).send({ error: 'não encontrado' });
      return reply.code(204).send();
    });

    // ---- Cards ----------------------------------------------------------

    /**
     * Lista enxuta pro board (sem anexos nem artefatos completos — ver
     * CardSummary). Filtros são server-side de propósito: filtrar no client
     * exigiria baixar tudo, que é justamente o que se quer evitar.
     */
    secured.get('/cards', async (req) => {
      const q = req.query as {
        search?: string;
        module?: string;
        mine?: string;
        resolvedWithinDays?: string;
      };

      const filters: CardFilters = {};
      if (q.search?.trim()) filters.search = q.search.trim();
      if (q.module) filters.module = q.module;
      if (q.mine === 'true') filters.createdById = currentUserId(req);

      const days = Number(q.resolvedWithinDays);
      if (Number.isFinite(days) && days > 0) filters.resolvedWithinDays = days;

      return findCardSummaries(filters);
    });

    /** Módulos que têm card — popula o seletor de filtro sem hardcode na UI. */
    secured.get('/cards/modules', async () => findUsedModules());

    /**
     * NOVO: dev cola o chamado. Enfileira o pipeline e responde na hora — quem
     * acompanha o progresso é o board (polling). Antes isso segurava o request
     * pelo tempo inteiro das chamadas de LLM.
     */
    secured.post('/cards', async (req, reply) => {
      const body = parseBody(CreateCardSchema, req, reply);
      if (!body) return;

      const card = createCard({
        id: randomUUID(),
        jiraKey: body.jiraKey,
        module: body.module,
        rawTicket: body.rawTicket,
        images: body.images,
        traceFiles: body.traceFiles,
        createdById: currentUserId(req),
      });
      await saveCard(card);
      await enqueueAdvance(card.id, body.traceProvider);

      return reply.code(201).send(card);
    });

    secured.get('/cards/:id', async (req, reply) => {
      const card = await findCardById((req.params as { id: string }).id);
      if (!card) return reply.code(404).send({ error: 'não encontrado' });
      return card;
    });

    /** RESOLVIDO: o texto da solução real é o que alimenta a base de conhecimento. */
    secured.post('/cards/:id/resolve', async (req, reply) => {
      const body = parseBody(ResolveCardSchema, req, reply);
      if (!body) return;

      const card = await findCardById((req.params as { id: string }).id);
      if (!card) return reply.code(404).send({ error: 'não encontrado' });

      const resolved = resolve(card, body.note, body.resolutionText, currentUserId(req));
      await saveCard(resolved);
      promoteResolvedTicket(resolved).catch((err) => {
        app.log.warn({ err, cardId: resolved.id }, 'falha ao promover ticket pro pb-insight');
      });
      return resolved;
    });

    secured.post('/cards/:id/reject', async (req, reply) => {
      const body = parseBody(RejectCardSchema, req, reply);
      if (!body) return;

      const card = await findCardById((req.params as { id: string }).id);
      if (!card) return reply.code(404).send({ error: 'não encontrado' });

      const next = requestNewProposal(card, body.note ?? 'diff rejeitado', currentUserId(req));
      await saveCard(next);
      await enqueueAdvance(next.id);
      return next;
    });

    secured.post('/cards/:id/retry', async (req, reply) => {
      const body = parseBody(RetryCardSchema, req, reply);
      if (!body) return;

      const card = await findCardById((req.params as { id: string }).id);
      if (!card) return reply.code(404).send({ error: 'não encontrado' });
      if (card.stage !== 'ERRO') {
        return reply.code(400).send({ error: 'só é possível reprocessar cards em ERRO' });
      }

      const next = retryFromError(card, undefined, currentUserId(req));
      await saveCard(next);
      await enqueueAdvance(next.id, body.traceProvider ?? undefined);
      return next;
    });

    /** Apagar é destrutivo e leva histórico e runs junto: só o autor ou um admin. */
    secured.delete('/cards/:id', async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const [card, me] = await Promise.all([findCardById(id), findUserById(currentUserId(req))]);
      if (!card) return reply.code(404).send({ error: 'não encontrado' });

      const isOwner = card.createdById && card.createdById === me?.id;
      if (!isOwner && !me?.isAdmin) {
        return reply.code(403).send({ error: 'só quem criou o card (ou um admin) pode apagá-lo' });
      }

      await deleteCardRow(id);
      return reply.code(204).send();
    });

    // ---- Jira -----------------------------------------------------------

    /**
     * O front distingue os dois casos pelo `code`: sem credencial é pendência
     * de setup (a UI cobra), Jira fora do ar é ruído (a UI ignora). Antes tudo
     * caía no mesmo catch silencioso e o usuário novo não via nada nem sabia por quê.
     */
    secured.get('/jira/pending', async (req, reply) => {
      const userId = currentUserId(req);
      const me = await findUserById(userId);

      if (me?.setupPending.includes('jira')) {
        return reply
          .code(428)
          .send({ code: 'JIRA_NOT_CONFIGURED', error: 'credenciais do Jira não configuradas' });
      }

      try {
        const [assigned, knownKeys, dismissed] = await Promise.all([
          searchAssignedIssues(userId),
          findAllJiraKeys().then((keys) => new Set(keys)),
          listDismissed(userId),
        ]);
        return assigned.filter((i) => !knownKeys.has(i.key) && !dismissed.has(i.key));
      } catch (err) {
        return reply.code(502).send({
          code: 'JIRA_UNAVAILABLE',
          error: err instanceof Error ? err.message : 'falha ao consultar o Jira',
        });
      }
    });

    secured.post('/jira/pending/:key/dismiss', async (req, reply) => {
      await dismissIssue(currentUserId(req), (req.params as { key: string }).key);
      return reply.code(204).send();
    });

    secured.get('/jira/:key', async (req, reply) => {
      try {
        return await fetchJiraIssue(currentUserId(req), (req.params as { key: string }).key);
      } catch (err) {
        return reply
          .code(502)
          .send({ error: err instanceof Error ? err.message : 'falha ao buscar do Jira' });
      }
    });

    // ---- Configurações / observabilidade --------------------------------

    secured.get('/settings', async () => {
      const s = await getSettings();
      return {
        anthropicApiKeySet: !!s.anthropicApiKey,
        model: s.model,
        aiProvider: s.aiProvider,
        openaiApiKeySet: !!s.openaiApiKey,
        openaiModel: s.openaiModel,
        traceServiceUrl: s.traceServiceUrl,
        jiraBaseUrl: s.jiraBaseUrl,
        jiraAssignedJql: s.jiraAssignedJql,
        pbInsightUrl: s.pbInsightUrl,
        updatedAt: s.updatedAt,
      };
    });

    secured.patch('/settings', async (req, reply) => {
      const me = await findUserById(currentUserId(req));
      if (!me?.isAdmin) return reply.code(403).send({ error: 'só admin altera configuração global' });

      const body = parseBody(UpdateSettingsSchema, req, reply);
      if (!body) return;

      const updated = await updateSettings(body);
      return {
        anthropicApiKeySet: !!updated.anthropicApiKey,
        model: updated.model,
        aiProvider: updated.aiProvider,
        openaiApiKeySet: !!updated.openaiApiKey,
        openaiModel: updated.openaiModel,
        traceServiceUrl: updated.traceServiceUrl,
        jiraBaseUrl: updated.jiraBaseUrl,
        jiraAssignedJql: updated.jiraAssignedJql,
        pbInsightUrl: updated.pbInsightUrl,
        updatedAt: updated.updatedAt,
      };
    });

    secured.get('/monitor', async () => {
      const [resources, queue, usage] = await Promise.all([
        checkResources(),
        queueStats(),
        usageSummary(30),
      ]);
      return { resources, queue, usage };
    });
  });
}
