import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Dois usos distintos, com garantias diferentes:
 *
 *  - senha DA PLATAFORMA: hash one-way (scrypt). Nunca precisa voltar ao texto.
 *  - senha DO JIRA: cifrada e reversível (AES-256-GCM), porque o Basic Auth
 *    exige a senha em claro na hora da chamada. Guardar em texto puro era o
 *    que a gente tinha antes — isso ao menos tira do alcance de um dump de
 *    banco. A chave mestra vive no .env (bootstrap, não dá pra guardar no
 *    próprio banco que ela protege).
 */
const ALGO = 'aes-256-gcm';

function masterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      'ENCRYPTION_KEY ausente ou muito curta no .env — necessária pra cifrar credenciais do Jira.',
    );
  }
  // deriva 32 bytes determinísticos a partir do valor configurado
  return scryptSync(raw, 'smart-ai-flow:jira', 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('payload cifrado inválido');
  const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(plain, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
