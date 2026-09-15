import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createCard, moveCard, type Card } from '../domain/card';
import { podeVerCard, recorteDeDono, type Viewer } from '../domain/cardVisibility';
import { Stage } from '../domain/stages';
import { buildJiraComment } from '../domain/jiraComment';
import { answerCardQuestion } from '../agents/chat';
import { appendChat, listChat } from '../infra/chatRepository';
import { resolve, requestNewProposal, retryFromError } from '../orchestrator/orchestrator';
import {
  addJiraComment,
  fetchJiraIssue,
  previewJql,
  searchAssignedIssues,
  testJiraConnection,
  JiraAuthError,
} from '../infra/jiraService';
import {
  findAllJiraKeys,
  findCardById,
  findCardSummaries,
  findUsedModules,
  saveCard,
  deleteCard as deleteCardRow,
  type CardFilters,
} from '../infra/cardRepository';
import { DEFAULT_ASSIGNED_JQL, getSettings, updateSettings } from '../infra/settingsRepository';
import { promoteResolvedTicket } from '../infra/pbInsight';
import { checkResources } from '../infra/monitor';
import { enqueueAdvance, queueStats } from '../infra/jobQueue';
import { recordRun, usageSummary } from '../infra/runRepository';
import { applyDiff, revertDiff, WorkspaceError } from '../infra/workspace';
import {
  branchForTicket,
  commitFiles,
  commitMessage,
  parseBitbucketRepo,
  previewCommit,
  pushBranch,
  remoteUrl,
  GitError,
} from '../infra/git';
import {
  checkRepositoryAccess,
  createPullRequest,
  findOpenPullRequest,
  BitbucketError,
} from '../infra/bitbucket';
import {
  authenticate,
  clearJiraAuthBlock,
  countUsers,
  getBitbucketCredentials,
  getGitIdentity,
  createUser,
  deleteUser,
  findUserById,
  listUsers,
  resetPasswordByUsername,
  updateUser,
} from '../infra/userRepository';
import {
  ChatMessageSchema,
  CommitCardSchema,
  CreateCardSchema,
  CreateUserSchema,
  JiraCommentSchema,
  LoginSchema,
  RejectCardSchema,
  ResolveCardSchema,
  ResetPasswordSchema,
  RetryCardSchema,
  UpdateMeSchema,
  PreviewJqlSchema,
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

/**
 * Quem está pedindo, e com que alcance. A regra de quem vê o quê mora em
 * `domain/cardVisibility`.
 */
async function viewerOf(req: FastifyRequest): Promise<Viewer> {
  const id = currentUserId(req);
  const me = await findUserById(id);
  return { id, isAdmin: !!me?.isAdmin };
}

/**
 * Carrega o card de :id conferindo que ele é de quem pediu, e é por onde passa
 * TODA rota de card — listar filtrado não basta, porque o id viaja na URL e quem
 * tiver um id de outro dev chega direto no recurso.
 *
 * Responde **404, e não 403**, de propósito: para quem não é dono o card não
 * existe, e um 403 confirmaria que aquele id existe — dá pra varrer a esteira
 * alheia só com a diferença entre as duas respostas.
 */
async function loadVisibleCard(req: FastifyRequest, reply: FastifyReply): Promise<Card | null> {
  const id = (req.params as { id: string }).id;
  const [card, viewer] = await Promise.all([findCardById(id), viewerOf(req)]);
  if (!card || !podeVerCard(card, viewer)) {
    reply.code(404).send({ error: 'não encontrado' });
    return null;
  }
  return card;
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

  /**
   * "Esqueci minha senha": nome de usuário + senha nova, e pronto.
   *
   * ISTO NÃO AUTENTICA NINGUÉM. Não há e-mail, token, pergunta secreta nem
   * senha antiga — quem alcança esta rota troca a senha de QUALQUER conta,
   * inclusive a de um admin. É uma decisão consciente e temporária: a
   * plataforma roda só na rede interna, e a alternativa hoje é `psql` na mão
   * porque não existe recuperação nenhuma.
   *
   * O QUE PRECISA ACONTECER ANTES DE ISTO SAIR DA REDE INTERNA (qualquer uma
   * das duas resolve): trocar por reset de admin autenticado, ou por token de
   * uso único enviado por e-mail. Enquanto isso, cada troca fica no log — é a
   * única trilha que sobra se alguém usar isto pra entrar na conta de outro.
   */
  app.post('/auth/reset-password', async (req, reply) => {
    const body = parseBody(ResetPasswordSchema, req, reply);
    if (!body) return;

    const user = await resetPasswordByUsername(body.username, body.password);
    if (!user) return reply.code(404).send({ error: 'usuário não encontrado' });

    req.log.warn(
      { username: user.username, ip: req.ip },
      'senha redefinida pela tela pública de recuperação',
    );
    return { ok: true, username: user.username };
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

      const viewer = await viewerOf(req);

      const filters: CardFilters = {};
      if (q.search?.trim()) filters.search = q.search.trim();
      if (q.module) filters.module = q.module;

      // O recorte por dono é do servidor, não da tela: para o dev ele é a regra
      // e não há como desligar. `mine` sobrevive só para o admin, que enxerga a
      // esteira inteira e usa o botão para achar os próprios cards.
      const dono = recorteDeDono(viewer, q.mine === 'true');
      if (dono) filters.createdById = dono;

      const days = Number(q.resolvedWithinDays);
      if (Number.isFinite(days) && days > 0) filters.resolvedWithinDays = days;

      return findCardSummaries(filters);
    });

    /** Módulos que têm card — popula o seletor de filtro sem hardcode na UI. */
    secured.get('/cards/modules', async (req) => {
      const viewer = await viewerOf(req);
      // Mesmo recorte do board: o seletor não pode revelar que existe card de um
      // sistema em que o dev não tem card nenhum.
      return findUsedModules(recorteDeDono(viewer, false));
    });

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
        devHints: body.devHints,
        images: body.images,
        traceFiles: body.traceFiles,
        createdById: currentUserId(req),
      });
      await saveCard(card);
      await enqueueAdvance(card.id, body.traceProvider);

      return reply.code(201).send(card);
    });

    secured.get('/cards/:id', async (req, reply) => {
      const card = await loadVisibleCard(req, reply);
      if (!card) return;
      return card;
    });

    /** RESOLVIDO: o texto da solução real é o que alimenta a base de conhecimento. */
    secured.post('/cards/:id/resolve', async (req, reply) => {
      const body = parseBody(ResolveCardSchema, req, reply);
      if (!body) return;

      const card = await loadVisibleCard(req, reply);
      if (!card) return;

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

      const card = await loadVisibleCard(req, reply);
      if (!card) return;

      const next = requestNewProposal(card, body.note ?? 'diff rejeitado', currentUserId(req));
      await saveCard(next);
      await enqueueAdvance(next.id);
      return next;
    });

    /**
     * REVISAO: o dev aceitou a proposta e manda a IA escrever o diff no working
     * copy. Só aqui o backend deixa de ser só-leitura, e só por ação humana.
     * Não commita nada: a mudança aparece como alteração local no working copy do dev.
     */
    secured.post('/cards/:id/apply', async (req, reply) => {
      const card = await loadVisibleCard(req, reply);
      if (!card) return;
      if (card.stage !== 'REVISAO') {
        return reply.code(400).send({ error: 'só dá pra aplicar o diff em REVISAO' });
      }
      if (!card.proposal?.diff) {
        return reply.code(400).send({ error: 'o card não tem diff proposto' });
      }
      if (card.appliedAt) {
        return reply.code(409).send({ error: 'este diff já foi aplicado — reverta antes de aplicar de novo' });
      }

      try {
        const result = await applyDiff(card.id, card.module, card.proposal.diff);
        const applied = {
          ...card,
          appliedAt: new Date().toISOString(),
          appliedFiles: result.files,
          appliedBackupDir: result.backupDir,
          history: [
            ...card.history,
            {
              from: card.stage,
              to: card.stage,
              by: 'DEV' as const,
              userId: currentUserId(req),
              at: new Date().toISOString(),
              note: `diff aplicado no código (${result.files.length} arquivo(s): ${result.files.join(', ')})`,
            },
          ],
        };
        await saveCard(applied);
        return applied;
      } catch (err) {
        if (err instanceof WorkspaceError) return reply.code(422).send({ error: err.message });
        throw err;
      }
    });

    /** Desfaz o apply pelo backup. O card continua em REVISAO, como antes. */
    secured.post('/cards/:id/revert', async (req, reply) => {
      const card = await loadVisibleCard(req, reply);
      if (!card) return;
      if (!card.appliedAt || !card.appliedBackupDir || !card.appliedFiles?.length) {
        return reply.code(400).send({ error: 'este card não tem alteração aplicada' });
      }

      try {
        await revertDiff(card.module, card.appliedBackupDir, card.appliedFiles);
        const reverted = {
          ...card,
          appliedAt: undefined,
          appliedFiles: undefined,
          appliedBackupDir: undefined,
          history: [
            ...card.history,
            {
              from: card.stage,
              to: card.stage,
              by: 'DEV' as const,
              userId: currentUserId(req),
              at: new Date().toISOString(),
              note: `alteração revertida (${card.appliedFiles.length} arquivo(s) restaurados)`,
            },
          ],
        };
        await saveCard(reverted);
        return reverted;
      } catch (err) {
        if (err instanceof WorkspaceError) return reply.code(422).send({ error: err.message });
        throw err;
      }
    });

    /**
     * Aceitar = **aplicar o diff no código** e mover pra VERSIONAMENTO.
     *
     * O dev pediu explicitamente esse comportamento: aceitar a solução escreve
     * no working copy mapeado (SMART_DESKTOP_PATH / SMART_WEB_PATH), sem passo
     * intermediário. É o caminho pro Auto Mode, em que a esteira inteira roda
     * sem clique.
     *
     * As garantias continuam onde estavam, e são elas que tornam isso aceitável:
     *  - `patch --dry-run` antes de tocar em arquivo: ou aplica tudo, ou nada;
     *  - backup de cada arquivo, com "desfazer" de um clique no passo 1;
     *  - artefato de build recusado;
     *  - **se o apply falhar, o card NÃO muda de estágio** — continua em REVISAO
     *    com o erro na tela, em vez de ir pra versionamento sem código aplicado.
     */
    secured.post('/cards/:id/accept', async (req, reply) => {
      const card = await loadVisibleCard(req, reply);
      if (!card) return;
      if (card.stage !== 'REVISAO') {
        return reply.code(400).send({ error: 'só dá pra aceitar a partir de REVISAO' });
      }
      if (!card.proposal?.diff?.trim()) {
        return reply
          .code(400)
          .send({ error: 'não há diff proposto — peça nova proposta ou resolva sem versionar' });
      }

      const userId = currentUserId(req);
      let applied = card;

      // Reaplicar por cima do que já está no disco duplicaria a mudança.
      if (!card.appliedAt) {
        try {
          const result = await applyDiff(card.id, card.module, card.proposal.diff);
          applied = {
            ...card,
            appliedAt: new Date().toISOString(),
            appliedFiles: result.files,
            appliedBackupDir: result.backupDir,
          };
        } catch (err) {
          if (err instanceof WorkspaceError) {
            // fica em REVISAO: versionar sem o código aplicado não faz sentido
            return reply.code(422).send({ error: err.message });
          }
          throw err;
        }
      }

      const accepted = moveCard(
        applied,
        Stage.VERSIONAMENTO,
        'DEV',
        applied.appliedFiles?.length
          ? `proposta aceita e aplicada no código (${applied.appliedFiles.length} arquivo(s))`
          : 'proposta aceita',
        userId,
      );
      await saveCard(accepted);
      return accepted;
    });

    // ---- Chat de dúvidas sobre o card -----------------------------------

    secured.get('/cards/:id/chat', async (req, reply) => {
      const card = await loadVisibleCard(req, reply);
      if (!card) return;
      return listChat(card.id);
    });

    /**
     * Pergunta pontual sobre a resolução. Contexto = o card inteiro + código
     * real, montado no backend: o dev não recola nada, e a resposta fica no
     * histórico do card.
     */
    secured.post('/cards/:id/chat', async (req, reply) => {
      const body = parseBody(ChatMessageSchema, req, reply);
      if (!body) return;

      const id = (req.params as { id: string }).id;
      const card = await loadVisibleCard(req, reply);
      if (!card) return;

      const userId = currentUserId(req);
      await appendChat({ cardId: id, role: 'user', content: body.content, userId });

      const previous = await listChat(id);

      try {
        const { answer, usage } = await answerCardQuestion(
          card,
          previous.map((m) => ({ role: m.role, content: m.content })),
        );

        await appendChat({ cardId: id, role: 'assistant', content: answer });
        // O chat gasta token como qualquer outro estágio — entra na auditoria.
        await recordRun({
          cardId: id,
          stage: card.stage,
          ok: true,
          provider: usage.provider,
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        });

        return listChat(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'falha ao responder';
        await recordRun({ cardId: id, stage: card.stage, ok: false, errorMessage: message });
        return reply.code(502).send({ error: message });
      }
    });

    // ---- Versionamento (commit, push, PR, comentário no Jira) -----------

    /**
     * Retrato do que aconteceria no commit, sem executar nada. É o que a tela
     * mostra antes do primeiro clique — a alternativa é o dev "ir aceitando"
     * sem saber o que sobe, que é exatamente o que essa etapa evita.
     */
    secured.get('/cards/:id/versioning', async (req, reply) => {
      const card = await loadVisibleCard(req, reply);
      if (!card) return;
      if (!card.appliedFiles?.length) {
        return reply.code(400).send({ error: 'o diff ainda não foi aplicado neste card' });
      }

      try {
        return await previewCommit(card.module, card.jiraKey, card.appliedFiles);
      } catch (err) {
        if (err instanceof GitError) return reply.code(422).send({ error: err.message });
        throw err;
      }
    });

    /** Commita os arquivos que o dev confirmou e move o card pra VERSIONAMENTO. */
    secured.post('/cards/:id/commit', async (req, reply) => {
      const body = parseBody(CommitCardSchema, req, reply);
      if (!body) return;

      const userId = currentUserId(req);
      const [card, identity] = await Promise.all([
        loadVisibleCard(req, reply),
        getGitIdentity(userId),
      ]);
      if (!card) return;
      if (card.stage !== 'VERSIONAMENTO' && card.stage !== 'REVISAO') {
        return reply.code(400).send({ error: 'o card não está em versionamento' });
      }
      if (!identity) {
        return reply.code(428).send({
          code: 'GIT_IDENTITY_MISSING',
          error: 'configure seu nome e e-mail de commit em Configurações > Minha conta',
        });
      }

      try {
        const message = body.message?.trim() || commitMessage(card.jiraKey, card.proposal?.summary);
        const { hash } = await commitFiles({
          module: card.module,
          jiraKey: card.jiraKey,
          files: body.files,
          message,
          authorName: identity.name,
          authorEmail: identity.email,
        });

        const withCommit = {
          ...card,
          branch: branchForTicket(card.jiraKey),
          commitHash: hash,
          committedFiles: body.files,
        };
        const note = `commit ${hash.slice(0, 8)} · ${body.files.length} arquivo(s) · ${message}`;

        // Vindo de REVISAO (card antigo, antes do botão "aceitar e versionar"),
        // o commit ainda move o estágio. Já em VERSIONAMENTO, só anota.
        const versioned =
          card.stage === Stage.REVISAO
            ? moveCard(withCommit, Stage.VERSIONAMENTO, 'DEV', note, userId)
            : {
                ...withCommit,
                history: [
                  ...card.history,
                  {
                    from: card.stage,
                    to: card.stage,
                    by: 'DEV' as const,
                    userId,
                    at: new Date().toISOString(),
                    note,
                  },
                ],
              };
        await saveCard(versioned);
        return versioned;
      } catch (err) {
        if (err instanceof GitError) return reply.code(422).send({ error: err.message });
        throw err;
      }
    });

    /** Push da branch + abertura do PR. Reaproveita PR já aberto pra não duplicar. */
    secured.post('/cards/:id/pull-request', async (req, reply) => {
      const userId = currentUserId(req);
      const [card, creds] = await Promise.all([
        loadVisibleCard(req, reply),
        getBitbucketCredentials(userId),
      ]);
      if (!card) return;
      if (!card.commitHash) return reply.code(400).send({ error: 'não há commit para publicar' });
      if (!creds) {
        return reply.code(428).send({
          code: 'BITBUCKET_NOT_CONFIGURED',
          error: 'configure seu usuário e app password do Bitbucket em Configurações > Minha conta',
        });
      }

      const branch = card.branch ?? branchForTicket(card.jiraKey);

      try {
        await pushBranch(card.module, branch, creds);

        const repo = parseBitbucketRepo(await remoteUrl(card.module));
        if (!repo) {
          return reply
            .code(422)
            .send({ error: 'o origin não parece ser um repositório do Bitbucket Cloud' });
        }

        const existing = await findOpenPullRequest(repo.workspace, repo.repo, branch, creds);
        const pr =
          existing ??
          (await createPullRequest(
            {
              ...repo,
              title: `${card.jiraKey} ${card.proposal?.summary ?? ''}`.trim(),
              description: card.proposal?.rationale ?? '',
              sourceBranch: branch,
              destinationBranch: 'main',
            },
            creds,
          ));

        const withPr = {
          ...card,
          branch,
          prUrl: pr.url,
          history: [
            ...card.history,
            {
              from: card.stage,
              to: card.stage,
              by: 'DEV' as const,
              userId,
              at: new Date().toISOString(),
              note: existing ? `PR já aberto: ${pr.url}` : `PR aberto: ${pr.url}`,
            },
          ],
        };
        await saveCard(withPr);
        return withPr;
      } catch (err) {
        if (err instanceof GitError || err instanceof BitbucketError) {
          return reply.code(422).send({ error: err.message });
        }
        throw err;
      }
    });

    /** Rascunho do comentário de entrega — o dev edita antes de publicar. */
    secured.get('/cards/:id/jira-comment', async (req, reply) => {
      const card = await loadVisibleCard(req, reply);
      if (!card) return;
      return {
        body: buildJiraComment({
          card,
          files: card.committedFiles ?? card.appliedFiles ?? [],
          prUrl: card.prUrl,
        }),
      };
    });

    /** Publica o comentário no chamado. Só o texto que veio da tela é enviado. */
    secured.post('/cards/:id/jira-comment', async (req, reply) => {
      const body = parseBody(JiraCommentSchema, req, reply);
      if (!body) return;

      const card = await loadVisibleCard(req, reply);
      if (!card) return;

      try {
        await addJiraComment(currentUserId(req), card.jiraKey, body.body);
      } catch (err) {
        if (err instanceof JiraAuthError) {
          return reply.code(428).send({ code: 'JIRA_AUTH_BLOCKED', error: err.message });
        }
        return reply
          .code(502)
          .send({ error: err instanceof Error ? err.message : 'falha ao comentar no Jira' });
      }

      const commented = {
        ...card,
        jiraCommentAt: new Date().toISOString(),
        history: [
          ...card.history,
          {
            from: card.stage,
            to: card.stage,
            by: 'DEV' as const,
            userId: currentUserId(req),
            at: new Date().toISOString(),
            note: 'comentário de entrega publicado no Jira',
          },
        ],
      };
      await saveCard(commented);
      return commented;
    });

    secured.post('/cards/:id/retry', async (req, reply) => {
      const body = parseBody(RetryCardSchema, req, reply);
      if (!body) return;

      const card = await loadVisibleCard(req, reply);
      if (!card) return;
      if (card.stage !== 'ERRO') {
        return reply.code(400).send({ error: 'só é possível reprocessar cards em ERRO' });
      }

      const next = retryFromError(card, undefined, currentUserId(req));
      await saveCard(next);
      await enqueueAdvance(next.id, body.traceProvider ?? undefined);
      return next;
    });

    /**
     * Apagar é destrutivo e leva histórico e runs junto. A regra continua "só o
     * autor ou um admin" — só que agora ela é a MESMA da visibilidade, então quem
     * chega aqui já passou por ela em `loadVisibleCard`.
     */
    secured.delete('/cards/:id', async (req, reply) => {
      const card = await loadVisibleCard(req, reply);
      if (!card) return;

      await deleteCardRow(card.id);
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
        const [assigned, knownKeys] = await Promise.all([
          searchAssignedIssues(userId),
          // Só os cards que ESTE dev enxerga: se o aviso sumisse porque outra
          // pessoa abriu card do mesmo chamado, ele perderia o chamado sem nunca
          // saber por quê.
          findAllJiraKeys(me?.isAdmin ? undefined : userId).then((keys) => new Set(keys)),
        ]);
        // Único filtro local: o que já virou card. Não existe dispensar — o
        // aviso espelha o Jira, e é lá que o chamado deixa de ser seu.
        return assigned.filter((i) => !knownKeys.has(i.key));
      } catch (err) {
        // Negação de auth não é indisponibilidade: o backend já parou de tentar,
        // e o front precisa mostrar o que fazer em vez de ignorar como ruído.
        if (err instanceof JiraAuthError) {
          return reply.code(428).send({ code: 'JIRA_AUTH_BLOCKED', error: err.message });
        }
        return reply.code(502).send({
          code: 'JIRA_UNAVAILABLE',
          error: err instanceof Error ? err.message : 'falha ao consultar o Jira',
        });
      }
    });

    /**
     * "Destravei no navegador, pode tentar de novo." Regravar a senha em
     * Minha conta também libera — este endpoint é pra quem só precisou resolver
     * o CAPTCHA, sem trocar credencial.
     */
    /**
     * Testa a credencial guardada contra o Jira, na hora. Antes disto, o dev
     * salvava a senha e só descobria se funcionou quando o board consultasse —
     * um minuto depois, e sem dizer o que falhou.
     *
     * Libera o bloqueio antes de tentar: clicar em testar É a forma explícita de
     * dizer "corrigi, tenta de novo". Se o Jira negar outra vez, o disjuntor
     * arma de novo no mesmo instante.
     */
    secured.post('/me/jira/test', async (req, reply) => {
      const userId = currentUserId(req);
      await clearJiraAuthBlock(userId);

      try {
        return await testJiraConnection(userId);
      } catch (err) {
        if (err instanceof JiraAuthError) {
          return reply.code(428).send({ code: 'JIRA_AUTH_BLOCKED', error: err.message });
        }
        return reply.code(502).send({
          code: 'JIRA_UNAVAILABLE',
          error: err instanceof Error ? err.message : 'falha ao falar com o Jira',
        });
      }
    });

    /** Testa a credencial do Bitbucket contra o repositório do origin. */
    secured.post('/me/bitbucket/test', async (req, reply) => {
      const creds = await getBitbucketCredentials(currentUserId(req));
      if (!creds) {
        return reply
          .code(428)
          .send({ code: 'BITBUCKET_NOT_CONFIGURED', error: 'preencha usuário e app password primeiro' });
      }

      // sem card no contexto, o teste usa o repositório do SMART Desktop
      const url = await remoteUrl('smartdesktop').catch(() => '');
      const repo = url ? parseBitbucketRepo(url) : null;
      if (!repo) {
        return reply
          .code(422)
          .send({ error: 'o origin do working copy não é um repositório do Bitbucket Cloud' });
      }

      const access = await checkRepositoryAccess(repo.workspace, repo.repo, creds);
      if (!access.ok) return reply.code(422).send({ error: access.detail });
      return access;
    });

    secured.post('/me/jira/unblock', async (req) => {
      await clearJiraAuthBlock(currentUserId(req));
      return findUserById(currentUserId(req));
    });

    /**
     * Confere uma JQL ANTES de salvar: devolve quantos chamados ela traz, uma
     * amostra e as situações que ela esconde (já com nome, não id).
     *
     * Nasceu de um caso real: uma JQL inválida salva pela tela ficava calada, o
     * board respondia 502 e o dev via "sem chamados" sem ligação nenhuma com a
     * causa. Consulta recusada volta 200 com `error` preenchido — quem chama é a
     * tela de configuração, e ela precisa MOSTRAR o erro, não tratar como falha
     * de rede.
     */
    secured.post('/jira/jql/preview', async (req, reply) => {
      const body = parseBody(PreviewJqlSchema, req, reply);
      if (!body) return;

      try {
        return await previewJql(currentUserId(req), body.jql);
      } catch (err) {
        if (err instanceof JiraAuthError) {
          return reply.code(428).send({ code: 'JIRA_AUTH_BLOCKED', error: err.message });
        }
        return reply
          .code(502)
          .send({ error: err instanceof Error ? err.message : 'falha ao falar com o Jira' });
      }
    });

    secured.get('/jira/:key', async (req, reply) => {
      try {
        return await fetchJiraIssue(currentUserId(req), (req.params as { key: string }).key);
      } catch (err) {
        if (err instanceof JiraAuthError) {
          return reply.code(428).send({ code: 'JIRA_AUTH_BLOCKED', error: err.message });
        }
        return reply
          .code(502)
          .send({ error: err instanceof Error ? err.message : 'falha ao buscar do Jira' });
      }
    });

    // ---- Configurações / observabilidade --------------------------------

    secured.get('/settings', async () => {
      const s = await getSettings();
      return {
        anthropicCredentialSet: !!s.anthropicCredential,
        anthropicAuthType: s.anthropicAuthType,
        model: s.model,
        aiProvider: s.aiProvider,
        openaiApiKeySet: !!s.openaiApiKey,
        openaiModel: s.openaiModel,
        traceServiceUrl: s.traceServiceUrl,
        jiraBaseUrl: s.jiraBaseUrl,
        jiraAssignedJql: s.jiraAssignedJql,
        // O padrão viaja junto: é o que dá à tela um "restaurar padrão" sem
        // repetir a string no front, onde ela sairia de sincronia no primeiro ajuste.
        jiraAssignedJqlDefault: DEFAULT_ASSIGNED_JQL,
        pbInsightUrl: s.pbInsightUrl,
        skills: s.skills,
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
        anthropicCredentialSet: !!updated.anthropicCredential,
        anthropicAuthType: updated.anthropicAuthType,
        model: updated.model,
        aiProvider: updated.aiProvider,
        openaiApiKeySet: !!updated.openaiApiKey,
        openaiModel: updated.openaiModel,
        traceServiceUrl: updated.traceServiceUrl,
        jiraBaseUrl: updated.jiraBaseUrl,
        jiraAssignedJql: updated.jiraAssignedJql,
        jiraAssignedJqlDefault: DEFAULT_ASSIGNED_JQL,
        pbInsightUrl: updated.pbInsightUrl,
        skills: updated.skills,
        updatedAt: updated.updatedAt,
      };
    });

    secured.get('/monitor', async (req) => {
      const [resources, queue, usage] = await Promise.all([
        // o recurso do Bitbucket depende de QUEM olha: a credencial é por dev
        checkResources(currentUserId(req)),
        queueStats(),
        usageSummary(30),
      ]);
      return { resources, queue, usage };
    });
  });
}
