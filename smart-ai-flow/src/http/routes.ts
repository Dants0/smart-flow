import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createCard } from '../domain/card';
import { advance, resolve, requestNewProposal, retryFromError } from '../orchestrator/orchestrator';
import { fetchJiraIssue, searchAssignedIssues } from '../infra/jiraService';
import {
  findAllCards,
  findAllJiraKeys,
  findCardById,
  saveCard,
  deleteCard as deleteCardRow,
} from '../infra/cardRepository';

/**
 * Rotas da esteira. Persistência real via Prisma/Postgres (cardRepository) —
 * um card que já passou por ANALISE/DESENVOLVIMENTO sobrevive a restart do
 * backend (inclusive o `tsx watch` reiniciando sozinho a cada save).
 */

// Chamados que o dev já dispensou do aviso de "atribuído a você" (em memória —
// perder isso num restart só faz o aviso reaparecer uma vez, sem custo real).
const dismissedJiraKeys = new Set<string>();

export async function routes(app: FastifyInstance) {
  // Lista todos os cards, mais recentes primeiro — alimenta o board Kanban.
  app.get('/cards', async () => {
    return findAllCards();
  });

  // NOVO: dev cola o chamado. Dispara análise + proposta automaticamente.
  // traceProvider é opcional: chave de IA PESSOAL (ex: OpenAI, pra teste) digitada na UI,
  // usada só na chamada ao app_trace — nunca vira campo do card nem é persistida.
  app.post('/cards', async (req, reply) => {
    const { jiraKey, module, rawTicket, images, traceFiles, traceProvider } = req.body as any;
    let card = createCard({ id: randomUUID(), jiraKey, module, rawTicket, images, traceFiles });
    await saveCard(card);
    card = await advance(card, saveCard, traceProvider); // roda ANALISE -> DESENVOLVIMENTO -> para em REVISAO
    return reply.code(201).send(card);
  });

  // Busca um chamado do Jira (texto + anexos) pra pré-preencher o form de novo card.
  // Não cria card nenhum — o dev ainda revisa e confirma antes de disparar a IA.
  app.get('/jira/:key', async (req, reply) => {
    try {
      const preview = await fetchJiraIssue((req.params as any).key);
      return preview;
    } catch (err) {
      return reply
        .code(502)
        .send({ error: err instanceof Error ? err.message : 'falha ao buscar do Jira' });
    }
  });

  // Consulta o card (a UI faz polling ou você troca por SSE/websocket).
  app.get('/cards/:id', async (req, reply) => {
    const card = await findCardById((req.params as any).id);
    if (!card) return reply.code(404).send({ error: 'não encontrado' });
    return card;
  });

  // RESOLVIDO: dev confirma que o cenário original não ocorre mais.
  app.post('/cards/:id/resolve', async (req, reply) => {
    const card = await findCardById((req.params as any).id);
    if (!card) return reply.code(404).send({ error: 'não encontrado' });
    const resolved = resolve(card, (req.body as any)?.note);
    await saveCard(resolved);
    return resolved;
  });

  // Dev rejeita o diff e pede nova proposta (volta pra DESENVOLVIMENTO).
  app.post('/cards/:id/reject', async (req, reply) => {
    const card = await findCardById((req.params as any).id);
    if (!card) return reply.code(404).send({ error: 'não encontrado' });
    let next = requestNewProposal(card, (req.body as any)?.note ?? 'diff rejeitado');
    next = await advance(next, saveCard);
    return next;
  });

  // ERRO: dev reprocessa o card (ex: corrigiu a API key) sem precisar recriar do zero.
  app.post('/cards/:id/retry', async (req, reply) => {
    const card = await findCardById((req.params as any).id);
    if (!card) return reply.code(404).send({ error: 'não encontrado' });
    if (card.stage !== 'ERRO') {
      return reply.code(400).send({ error: 'só é possível reprocessar cards em ERRO' });
    }
    const { traceProvider } = (req.body as any) ?? {};
    let next = retryFromError(card);
    next = await advance(next, saveCard, traceProvider);
    return next;
  });

  // Apaga um card permanentemente (ex: card de teste, duplicado, criado por engano).
  app.delete('/cards/:id', async (req, reply) => {
    const ok = await deleteCardRow((req.params as any).id);
    if (!ok) return reply.code(404).send({ error: 'não encontrado' });
    return reply.code(204).send();
  });

  // Chamados atribuídos ao dev no Jira que ainda não viraram card (nem foram
  // dispensados). Só AVISA — a UI ainda pede confirmação antes de criar o card.
  app.get('/jira/pending', async (req, reply) => {
    try {
      const assigned = await searchAssignedIssues();
      const knownKeys = new Set(await findAllJiraKeys());
      const pending = assigned.filter(
        (i) => !knownKeys.has(i.key) && !dismissedJiraKeys.has(i.key),
      );
      return pending;
    } catch (err) {
      return reply
        .code(502)
        .send({ error: err instanceof Error ? err.message : 'falha ao consultar o Jira' });
    }
  });

  // Dev dispensa o aviso sem criar card (ex: vai tratar fora da esteira).
  app.post('/jira/pending/:key/dismiss', async (req, reply) => {
    dismissedJiraKeys.add((req.params as any).key);
    return reply.code(204).send();
  });
}
