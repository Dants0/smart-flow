/**
 * Classificação de falha do provedor de IA: **transitória** (a mesma chamada
 * daqui a pouco funciona) ou **definitiva** (só muda com ação humana).
 *
 * A distinção não existia, e todo erro caía no mesmo balde: um 429 de limite de
 * uso — que reabre sozinho em minutos — mandava o card pra ERRO igual a uma
 * credencial inválida, e a esteira só voltava com um clique no reprocessar.
 * Com token OAuth isso deixou de ser exceção: a cota é a da assinatura, a mesma
 * que o dev gasta no Claude Code, então bater o teto é rotina, não incidente.
 *
 * Quem age sobre isto é a fila (`jobQueue.ts`): erro transitório vira espera
 * agendada, e o card fica onde está em vez de virar exceção.
 */

/** Falha que se resolve sozinha com o tempo — nunca deve mandar o card pra ERRO. */
export class TransientLlmError extends Error {
  /** Status HTTP, quando houve resposta (undefined = falha de conexão). */
  readonly status?: number;
  /** Quanto esperar, quando o provedor disse — `retry-after` ou o reset do balde. */
  readonly retryAfterMs?: number;
  /** Headers `anthropic-ratelimit-*` da resposta: é o que diz QUAL cota estourou. */
  readonly limits: Record<string, string>;

  constructor(
    message: string,
    opts: { status?: number; retryAfterMs?: number; limits?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = 'TransientLlmError';
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
    this.limits = opts.limits ?? {};
  }
}

/**
 * Status que valem nova tentativa. 429 é limite de uso; 5xx e 529 (`overloaded`,
 * exclusivo da Anthropic) são capacidade do lado deles. 408 é timeout do gateway.
 *
 * Fora desta lista, nada é retentado — em especial o 400 de
 * `credit balance is too low` e o 401 de credencial errada, que só saem do lugar
 * com alguém agindo. Retentar esses seria queimar a fila em silêncio.
 */
const STATUS_TRANSITORIOS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

export function statusEhTransitorio(status: number | undefined): boolean {
  // Sem status = a requisição não chegou a ter resposta (DNS, socket, timeout
  // do cliente). Isso é sempre transitório.
  return status === undefined || STATUS_TRANSITORIOS.has(status);
}

/**
 * Extrai os headers de cota da resposta. Guardados crus de propósito: os nomes
 * mudam conforme o tipo de credencial (chave de API tem baldes por
 * requisição/token; token OAuth tem os `unified-*` da assinatura), e o que
 * interessa na auditoria é ler depois qual deles estourou — não normalizar.
 */
export function headersDeCota(headers: Record<string, string | null | undefined> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) {
    const nome = k.toLowerCase();
    if (v == null) continue;
    if (nome === 'retry-after' || nome.startsWith('anthropic-ratelimit-')) out[nome] = v;
  }
  return out;
}

/**
 * Quanto esperar, segundo o provedor. Duas fontes, nesta ordem:
 *
 * 1. `retry-after` — em segundos, ou data HTTP.
 * 2. os `*-reset` dos baldes de cota — RFC3339 ou epoch em segundos. Pega o
 *    MAIOR: esperar o balde que reabre primeiro só produziria outro 429.
 *
 * Devolve `undefined` quando nada é legível, e aí quem chama usa backoff próprio.
 */
export function esperaSugerida(
  cota: Record<string, string>,
  agora = Date.now(),
): number | undefined {
  const candidatos: number[] = [];

  const retryAfter = cota['retry-after'];
  if (retryAfter) {
    const segundos = Number(retryAfter);
    if (Number.isFinite(segundos)) candidatos.push(segundos * 1000);
    else {
      const data = Date.parse(retryAfter);
      if (Number.isFinite(data)) candidatos.push(data - agora);
    }
  }

  for (const [nome, valor] of Object.entries(cota)) {
    if (!nome.endsWith('-reset')) continue;
    // Epoch em segundos (baldes unificados) ou RFC3339 (baldes por chave).
    const numero = Number(valor);
    const quando = Number.isFinite(numero) ? numero * 1000 : Date.parse(valor);
    if (Number.isFinite(quando)) candidatos.push(quando - agora);
  }

  const maior = Math.max(0, ...candidatos.filter((ms) => Number.isFinite(ms)));
  return candidatos.length > 0 && maior > 0 ? maior : undefined;
}

/**
 * Distingue o 429 de COTA do 429 de PERMISSÃO, que a API não diferencia no status.
 *
 * Um limite de uso real vem com os baldes (`anthropic-ratelimit-*`) e um
 * `retry-after`: são eles que dizem o que estourou e quando reabre. Uma recusa
 * de permissão vem com 429, mensagem esvaziada (`"message":"Error"`) e NENHUM
 * desses headers — porque não há cota envolvida, a chamada é barrada antes de
 * ser contabilizada (o /usage da conta continua marcando 0%).
 *
 * O caso concreto: token OAuth de conta corporativa (Team/Enterprise) autentica
 * e resolve a organização, mas não tem direito de chamar /v1/messages fora do
 * Claude Code. Sem esta distinção a esteira esperava 20 vezes, ~3h, e caía em
 * ERRO com a mesma mensagem vazia — a espera é inútil quando não há nada
 * reabrindo. Aqui é melhor falhar rápido dizendo o que fazer.
 *
 * Se a heurística errar (429 de cota que venha sem headers), o custo é o
 * comportamento antigo: card em ERRO e o dev clica reprocessar.
 */
export function ehRecusaDisfarcadaDe429(
  status: number | undefined,
  cota: Record<string, string>,
): boolean {
  return status === 429 && Object.keys(cota).length === 0;
}

/** O que dizer ao dev quando o 429 é recusa de permissão, não cota. */
export const RECUSA_OAUTH =
  'A Anthropic recusou a chamada (429 sem nenhum header de cota, consumo não contabilizado) — ' +
  'sinal de credencial que autentica mas não pode chamar a API direto, típico de token OAuth ' +
  'de conta corporativa. Configure uma chave de API (sk-ant-api...) em Configurações > IA, ' +
  'ou troque o provider para OpenAI.';

/** Resumo de uma linha dos headers de cota, pra entrar na mensagem de auditoria. */
export function resumoDeCota(cota: Record<string, string>): string {
  const partes = Object.entries(cota).map(([k, v]) => `${k}=${v}`);
  return partes.length ? ` [${partes.join(' ')}]` : '';
}
