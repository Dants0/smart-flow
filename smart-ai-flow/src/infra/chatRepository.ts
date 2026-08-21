import { prisma } from './db';

/**
 * Histórico do chat de um card. Persistido: a dúvida do dev e a resposta fazem
 * parte da história da resolução — quem revisar o card semanas depois precisa
 * ver o que foi perguntado, não só o diff final.
 */
export interface StoredChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  userName?: string;
  at: string;
}

export async function listChat(cardId: string): Promise<StoredChatMessage[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { cardId },
    orderBy: { at: 'asc' },
    include: { user: { select: { displayName: true } } },
  });

  return rows.map((r) => ({
    id: r.id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    userName: r.user?.displayName ?? undefined,
    at: r.at.toISOString(),
  }));
}

export async function appendChat(input: {
  cardId: string;
  role: 'user' | 'assistant';
  content: string;
  userId?: string;
}): Promise<void> {
  await prisma.chatMessage.create({
    data: {
      cardId: input.cardId,
      role: input.role,
      content: input.content,
      userId: input.userId ?? null,
    },
  });
}
