import { randomBytes } from 'node:crypto';
import { bitbucketApiIdentity } from '../domain/bitbucketIdentity';
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
  /** Preenchido quando o Jira negou a autenticação e o backend parou de tentar. */
  jiraAuthBlocked?: { at: string; reason: string };

  /** Identidade e credencial de commit/PR — o versionamento é feito como o dev. */
  gitName: string | null;
  gitEmail: string | null;
  bitbucketUser: string | null;
  bitbucketEmail: string | null;
  bitbucketAppPasswordSet: boolean;

  /** Credencial do MW desenv. `mwValidatedAt` preenchido = bateu com a tabela usr. */
  mwUser: string | null;
  mwPasswordSet: boolean;
  mwValidatedAt: string | null;
  mwValidationError: string | null;
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
  jiraAuthBlockedAt?: Date | null;
  jiraAuthBlockedReason?: string | null;
  gitName?: string | null;
  gitEmail?: string | null;
  bitbucketUser?: string | null;
  bitbucketEmail?: string | null;
  bitbucketAppPasswordEnc?: string | null;
  mwUser?: string | null;
  mwPasswordEnc?: string | null;
  mwValidatedAt?: Date | null;
  mwValidationError?: string | null;
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
    jiraAuthBlocked: row.jiraAuthBlockedAt
      ? {
          at: row.jiraAuthBlockedAt.toISOString(),
          reason: row.jiraAuthBlockedReason ?? 'autenticação negada pelo Jira',
        }
      : undefined,
    gitName: row.gitName ?? null,
    gitEmail: row.gitEmail ?? null,
    bitbucketUser: row.bitbucketUser ?? null,
    bitbucketEmail: row.bitbucketEmail ?? null,
    bitbucketAppPasswordSet: !!row.bitbucketAppPasswordEnc,
    mwUser: row.mwUser ?? null,
    mwPasswordSet: !!row.mwPasswordEnc,
    mwValidatedAt: row.mwValidatedAt?.toISOString() ?? null,
    mwValidationError: row.mwValidationError ?? null,
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

/**
 * Conta local que corresponde ao que foi digitado no login: pelo nome de usuário
 * da plataforma OU pelo usuário do Jira já vinculado, sem diferenciar caixa.
 */
export async function findLoginCandidate(
  typed: string,
): Promise<{ id: string; username: string; jiraUser: string | null } | null> {
  const nome = typed.trim();
  return prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: nome, mode: 'insensitive' } },
        { jiraUser: { equals: nome, mode: 'insensitive' } },
      ],
    },
    select: { id: true, username: true, jiraUser: true },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Grava quem acabou de autenticar no Jira: vincula a conta existente ou cria a
 * conta na hora. A senha que o Jira aceitou vira a credencial usada pela
 * esteira — então logar é também a forma de manter a senha em dia depois que
 * ela expira no Jira, e de soltar o disjuntor de CAPTCHA.
 *
 * O primeiro usuário da plataforma vira admin: é o que substitui a tela de
 * bootstrap, que pedia pra criar uma conta antes de qualquer coisa.
 */
export async function upsertJiraLogin(input: {
  existingId?: string;
  jiraName: string;
  displayName: string;
  password: string;
  localUsername: string;
}): Promise<AuthUser> {
  const credencial = {
    jiraUser: input.jiraName,
    jiraPasswordEnc: encryptSecret(input.password),
    jiraAuthBlockedAt: null,
    jiraAuthBlockedReason: null,
    mustChangePassword: false,
  };

  // Conta local com o mesmo nome e ainda sem Jira vinculado é a mesma pessoa
  // (o nome de usuário do time é o do domínio) — vincula em vez de colidir.
  let existingId = input.existingId;
  if (!existingId) {
    const homonimo = await prisma.user.findUnique({ where: { username: input.localUsername } });
    if (homonimo?.jiraUser && homonimo.jiraUser.toLowerCase() !== input.jiraName.toLowerCase()) {
      // Mesmo nome local, OUTRA conta do Jira: vincular entregaria a conta de
      // uma pessoa a outra. Raro o bastante pra resolver na mão.
      throw new Error(
        `já existe na plataforma o usuário "${input.localUsername}" vinculado a outra conta do Jira — peça a um admin para renomear ou remover essa conta`,
      );
    }
    existingId = homonimo?.id;
  }

  if (existingId) {
    const row = await prisma.user.update({
      where: { id: existingId },
      data: { ...credencial, displayName: input.displayName },
    });
    return toAuthUser(row);
  }

  const isAdmin = (await prisma.user.count()) === 0;
  const row = await prisma.user.create({
    data: {
      ...credencial,
      username: input.localUsername,
      displayName: input.displayName,
      // Senha local inutilizável: a conta só entra pelo Jira (ver domain/jiraLogin).
      passwordHash: hashPassword(randomBytes(32).toString('hex')),
      isAdmin,
    },
  });
  return toAuthUser(row);
}

/** true = a conta entra pelo Jira, e a senha local não vale (nem pode ser redefinida). */
export async function isJiraLinked(username: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { username }, select: { jiraUser: true } });
  return !!row?.jiraUser;
}

/**
 * Redefine a senha pelo nome de usuário, sem exigir a senha antiga — é o que
 * sustenta a tela de "esqueci minha senha".
 *
 * Zera `mustChangePassword` pelo mesmo motivo de `updateUser`: quem acabou de
 * escolher a senha não precisa ser cobrado a escolher de novo no login seguinte.
 *
 * Devolve `null` quando o usuário não existe — a tela precisa dizer isso, e
 * esconder não protege ninguém aqui: qualquer um já pode trocar a senha de
 * qualquer conta por esta porta (ver a rota).
 */
export async function resetPasswordByUsername(
  username: string,
  password: string,
): Promise<AuthUser | null> {
  const row = await prisma.user.findUnique({ where: { username } });
  if (!row) return null;

  const atualizado = await prisma.user.update({
    where: { id: row.id },
    data: { passwordHash: hashPassword(password), mustChangePassword: false },
  });
  return toAuthUser(atualizado);
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
  patch: {
    displayName?: string;
    password?: string;
    jiraUser?: string;
    jiraPassword?: string;
    gitName?: string;
    gitEmail?: string;
    bitbucketUser?: string;
    bitbucketEmail?: string;
    bitbucketAppPassword?: string;
    mwUser?: string;
    mwPassword?: string;
  },
): Promise<AuthUser> {
  const data: Record<string, string | boolean | Date | null> = {};
  if (patch.displayName) data.displayName = patch.displayName;
  if (patch.password) {
    data.passwordHash = hashPassword(patch.password);
    data.mustChangePassword = false; // trocou: a pendência de setup se resolve sozinha
  }
  // trim: senha colada com espaço no fim falha o Basic Auth de um jeito que
  // parece 'senha errada' e ninguém encontra olhando o campo
  if (patch.jiraUser !== undefined) data.jiraUser = patch.jiraUser.trim() || null;
  if (patch.jiraPassword) data.jiraPasswordEnc = encryptSecret(patch.jiraPassword.trim());

  // Regravar credencial é a forma normal de dizer 'corrigi, pode tentar de novo'.
  if (patch.jiraUser !== undefined || patch.jiraPassword) {
    data.jiraAuthBlockedAt = null;
    data.jiraAuthBlockedReason = null;
  }

  if (patch.gitName !== undefined) data.gitName = patch.gitName.trim() || null;
  if (patch.gitEmail !== undefined) data.gitEmail = patch.gitEmail.trim() || null;
  if (patch.bitbucketUser !== undefined) data.bitbucketUser = patch.bitbucketUser.trim() || null;
  if (patch.bitbucketEmail !== undefined) data.bitbucketEmail = patch.bitbucketEmail.trim() || null;
  if (patch.bitbucketAppPassword) {
    data.bitbucketAppPasswordEnc = encryptSecret(patch.bitbucketAppPassword.trim());
  }

  if (patch.mwUser !== undefined) data.mwUser = patch.mwUser.trim() || null;
  // Senha do MW é texto aberto e comparada exata: não passa por trim, senão uma
  // senha que termina em espaço nunca bateria.
  if (patch.mwPassword) data.mwPasswordEnc = encryptSecret(patch.mwPassword);
  // Credencial trocada volta a ser "não validada" até conferir de novo na usr.
  if (patch.mwUser !== undefined || patch.mwPassword) {
    data.mwValidatedAt = null;
    data.mwValidationError = null;
  }

  const row = await prisma.user.update({ where: { id }, data });
  return toAuthUser(row);
}

/** Credencial do MW desenv em claro — só pra conferir na usr. Null = não cadastrada. */
export async function getMwCredentials(
  userId: string,
): Promise<{ user: string; password: string } | null> {
  const row = await prisma.user.findUnique({ where: { id: userId } });
  if (!row?.mwUser || !row.mwPasswordEnc) return null;
  return { user: row.mwUser, password: decryptSecret(row.mwPasswordEnc) };
}

/** Grava o resultado da conferência na usr: validada agora, ou recusada com o motivo. */
export async function recordMwValidation(
  userId: string,
  result: { ok: true } | { ok: false; mensagem: string },
): Promise<AuthUser> {
  const row = await prisma.user.update({
    where: { id: userId },
    data: result.ok
      ? { mwValidatedAt: new Date(), mwValidationError: null }
      : { mwValidatedAt: null, mwValidationError: result.mensagem },
  });
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

/**
 * Marca que o Jira negou a autenticação deste usuário. A partir daqui o backend
 * não tenta mais — é o que impede o polling de 60s de rearmar o CAPTCHA no
 * servidor logo depois de o dev destravar pelo navegador.
 */
export async function blockJiraAuth(userId: string, reason: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { jiraAuthBlockedAt: new Date(), jiraAuthBlockedReason: reason },
  });
}

/** Libera as tentativas de novo (dev regravou a senha ou destravou no navegador). */
export async function clearJiraAuthBlock(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { jiraAuthBlockedAt: null, jiraAuthBlockedReason: null },
  });
}

export async function getJiraAuthBlock(
  userId: string,
): Promise<{ at: Date; reason: string } | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { jiraAuthBlockedAt: true, jiraAuthBlockedReason: true },
  });
  if (!row?.jiraAuthBlockedAt) return null;
  return { at: row.jiraAuthBlockedAt, reason: row.jiraAuthBlockedReason ?? 'autenticação negada pelo Jira' };
}

/**
 * Credencial do Bitbucket em claro — só pra uso imediato no push/PR.
 *
 * Devolve DUAS identidades porque a Atlassian pede metades diferentes no Basic
 * Auth desde que o API token substituiu a app password:
 *   `user`  -> git push   (nome de usuário do Bitbucket)
 *   `email` -> API REST   (e-mail da conta Atlassian)
 *
 * Sem `bitbucketEmail` preenchido, `email` cai pro username: é exatamente o
 * comportamento antigo, então quem ainda usa app password (onde o username
 * servia pros dois) continua funcionando sem tocar em nada.
 */
export async function getBitbucketCredentials(
  userId: string,
): Promise<{ user: string; email: string; appPassword: string } | null> {
  const row = await prisma.user.findUnique({ where: { id: userId } });
  if (!row?.bitbucketUser || !row.bitbucketAppPasswordEnc) return null;
  return {
    user: row.bitbucketUser,
    email: bitbucketApiIdentity(row.bitbucketUser, row.bitbucketEmail),
    appPassword: decryptSecret(row.bitbucketAppPasswordEnc),
  };
}

/** Identidade do commit. Cai pro nome de exibição quando o dev não preencheu. */
export async function getGitIdentity(
  userId: string,
): Promise<{ name: string; email: string } | null> {
  const row = await prisma.user.findUnique({ where: { id: userId } });
  if (!row) return null;
  if (!row.gitEmail) return null;
  return { name: row.gitName || row.displayName, email: row.gitEmail };
}
