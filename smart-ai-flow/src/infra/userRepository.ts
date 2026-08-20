import { prisma } from './db';
import { decryptSecret, encryptSecret, hashPassword, verifyPassword } from './crypto';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  jiraUser: string | null;
  jiraPasswordSet: boolean;
  /** true = conta criada por admin, com senha provisória ainda não trocada. */
  mustChangePassword: boolean;
  /** Pendências que impedem a plataforma de funcionar plenamente pra este usuário. */
  setupPending: SetupStep[];
}

export type SetupStep = 'password' | 'jira';

/** Credenciais do Jira em claro — só pra uso imediato na chamada HTTP. */
export interface JiraCredentials {
  user: string;
  password: string;
}

function toAuthUser(row: {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  jiraUser: string | null;
  jiraPasswordEnc: string | null;
}): AuthUser {
  // Sem credencial do Jira o banner de chamados atribuídos simplesmente nunca
  // aparece — e o usuário novo não tem como adivinhar o porquê. Por isso a
  // pendência é explícita e a UI cobra.
  const setupPending: SetupStep[] = [];
  if (row.mustChangePassword) setupPending.push('password');
  if (!row.jiraUser || !row.jiraPasswordEnc) setupPending.push('jira');

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    isAdmin: row.isAdmin,
    mustChangePassword: row.mustChangePassword,
    jiraUser: row.jiraUser,
    jiraPasswordSet: !!row.jiraPasswordEnc,
    setupPending,
  };
}

export async function countUsers(): Promise<number> {
  return prisma.user.count();
}

export async function listUsers(): Promise<AuthUser[]> {
  const rows = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map(toAuthUser);
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const row = await prisma.user.findUnique({ where: { id } });
  return row ? toAuthUser(row) : null;
}

export async function authenticate(username: string, password: string): Promise<AuthUser | null> {
  const row = await prisma.user.findUnique({ where: { username } });
  if (!row || !verifyPassword(password, row.passwordHash)) return null;
  return toAuthUser(row);
}

export async function createUser(input: {
  username: string;
  displayName: string;
  password: string;
  isAdmin?: boolean;
  jiraUser?: string;
  jiraPassword?: string;
  /** Conta criada por admin nasce provisória; o bootstrap do primeiro admin não. */
  mustChangePassword?: boolean;
}): Promise<AuthUser> {
  const row = await prisma.user.create({
    data: {
      username: input.username,
      displayName: input.displayName,
      passwordHash: hashPassword(input.password),
      isAdmin: input.isAdmin ?? false,
      mustChangePassword: input.mustChangePassword ?? false,
      jiraUser: input.jiraUser ?? null,
      jiraPasswordEnc: input.jiraPassword ? encryptSecret(input.jiraPassword) : null,
    },
  });
  return toAuthUser(row);
}

export async function updateUser(
  id: string,
  patch: { displayName?: string; password?: string; jiraUser?: string; jiraPassword?: string },
): Promise<AuthUser> {
  const data: Record<string, string | boolean | null> = {};
  if (patch.displayName) data.displayName = patch.displayName;
  if (patch.password) {
    data.passwordHash = hashPassword(patch.password);
    data.mustChangePassword = false; // trocou: a pendência de setup se resolve sozinha
  }
  if (patch.jiraUser !== undefined) data.jiraUser = patch.jiraUser || null;
  if (patch.jiraPassword) data.jiraPasswordEnc = encryptSecret(patch.jiraPassword);

  const row = await prisma.user.update({ where: { id }, data });
  return toAuthUser(row);
}

export async function deleteUser(id: string): Promise<boolean> {
  try {
    await prisma.user.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/** Decifra as credenciais do Jira do usuário. Null quando ele ainda não configurou. */
export async function getJiraCredentials(userId: string): Promise<JiraCredentials | null> {
  const row = await prisma.user.findUnique({ where: { id: userId } });
  if (!row?.jiraUser || !row.jiraPasswordEnc) return null;
  return { user: row.jiraUser, password: decryptSecret(row.jiraPasswordEnc) };
}

export async function listDismissed(userId: string): Promise<Set<string>> {
  const rows = await prisma.dismissedIssue.findMany({ where: { userId }, select: { jiraKey: true } });
  return new Set(rows.map((r) => r.jiraKey));
}

export async function dismissIssue(userId: string, jiraKey: string): Promise<void> {
  await prisma.dismissedIssue.upsert({
    where: { userId_jiraKey: { userId, jiraKey } },
    update: {},
    create: { userId, jiraKey },
  });
}
