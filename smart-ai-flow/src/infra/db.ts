import { PrismaClient } from '@prisma/client';

/** Client único do Prisma — reaproveitado por toda a aplicação. */
export const prisma = new PrismaClient();
