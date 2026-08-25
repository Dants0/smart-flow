/**
 * Parser de `application/json` que aceita corpo vazio.
 *
 * O default do Fastify responde 400 `FST_ERR_CTP_EMPTY_JSON_BODY` quando o
 * header anuncia JSON e o corpo é vazio — e o navegador faz exatamente isso em
 * toda rota sem corpo: "Testar conexão" do Bitbucket e do Jira, destravar o
 * Jira, dispensar chamado, apagar usuário. Do lado do dev o sintoma é um 400
 * genérico num botão que deveria só funcionar.
 *
 * Fica fora do `server.ts` para ter teste próprio: `app.inject()` não manda
 * content-type sozinho, então uma suíte que só usa inject passa com o app real
 * quebrado. Foi assim que a mesma falha passou despercebida no pb-insight
 * (docs/14 de lá).
 */
export class InvalidJsonBodyError extends Error {
  /** Lido pelo Fastify para responder 400 em vez de 500. */
  statusCode = 400;

  constructor() {
    super('corpo da requisição não é JSON válido');
    this.name = 'InvalidJsonBodyError';
  }
}

/** Corpo vazio (ou só espaço) vira `{}`. JSON malformado continua sendo 400. */
export function parseJsonBody(body: unknown): unknown {
  if (typeof body !== 'string' || body.trim() === '') return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new InvalidJsonBodyError();
  }
}
