import { getSettings } from './settingsRepository';
import type { Card } from '../domain/card';

/**
 * Cliente do PB Insight — serviço próprio (pasta `pb-insight/`, projeto separado)
 * com o grafo real do SMART Desktop indexado (15k+ objetos: windows, datawindows,
 * user objects, com o código de cada evento/função). Roda local via `npm run serve`.
 *
 * Estratégia: extrai termos de busca do texto do chamado, consulta /search
 * (bate em texto de UI e em corpo de código), e pros matches de código busca
 * o corpo real do evento via /objects/:name/events/:eventName — é a técnica
 * documentada no próprio pb-insight (docs/04) como a que converge pro
 * mecanismo certo do fix, evidência real em vez de suposição.
 */
const FETCH_TIMEOUT_MS = 5000;
const MAX_HITS = 6;
/**
 * O PB Insight devolve o corpo COMPLETO do evento; cortar em 3.000 caracteres
 * entregava evento pela metade justamente nos objetos grandes, que são os que
 * mais aparecem em chamado. O teto continua existindo (o prompt é pago), mas
 * agora cabe um evento inteiro de umas 300 linhas.
 */
const SNIPPET_CHARS = 12000;

const STOPWORDS = new Set([
  'para', 'como', 'sistema', 'chamado', 'incidente', 'erro', 'quando', 'depois',
  'antes', 'tela', 'clicar', 'abrir', 'modulo', 'módulo', 'usuario', 'usuário',
  'versao', 'versão', 'passo', 'realizar', 'realizado', 'apresenta', 'apresentando',
  'houve', 'solucao', 'solução', 'contorno', 'reproduzido', 'ocorre', 'diferente',
  'observacao', 'observação', 'disposicao', 'disposição', 'esclarecimentos',
]);

/**
 * Frases de tela que o chamado cita — normalmente entre aspas, ou coladas do
 * print pelo suporte.
 *
 * Existem porque a mensagem quase nunca está literal no código: ela é montada em
 * runtime (`"prefixo " + sStatus + "."`). Buscar a frase inteira dá **zero**
 * resultado (medido: "Este paciente está registrado no sistema como Óbito.
 * Deseja prosseguir?" → count 0), enquanto o prefixo que sobreviveu à
 * concatenação acha o código.
 */
export function extractPhrases(text: string): string[] {
  const phrases: string[] = [];

  // 1) o que está entre aspas é quase sempre a mensagem citada pelo suporte
  for (const match of text.matchAll(/["'“”']([^"'“”']{15,160})["'“”']/g)) {
    phrases.push(match[1].trim());
  }

  // 2) sem aspas, frases longas o bastante pra serem texto de tela
  if (phrases.length === 0) {
    for (const raw of text.split(/[\n.!?]+/)) {
      const frase = raw.trim();
      if (frase.length >= 25 && frase.split(/\s+/).length >= 5) phrases.push(frase);
    }
  }

  return [...new Set(phrases)].slice(0, 3);
}

/**
 * Encurta a frase pela direita, palavra a palavra, até o mínimo útil.
 * É a sequência de tentativas da busca: a cauda da mensagem costuma ser a parte
 * concatenada em runtime, e é ela que impede o match.
 */
export function phraseBackoff(phrase: string, minWords = 3): string[] {
  const words = phrase
    .replace(/[.?!,;:]+$/g, '')
    .split(/\s+/)
    .filter(Boolean);

  const tentativas: string[] = [];
  for (let n = Math.min(words.length, 12); n >= minWords; n--) {
    tentativas.push(words.slice(0, n).join(' '));
  }
  return tentativas;
}

function extractKeywords(query: string): string[] {
  const words = query.toLowerCase().match(/[a-z][a-z0-9_]{3,}/g) ?? [];
  const unique = [...new Set(words)].filter((w) => !STOPWORDS.has(w));
  const pbLike = unique.filter((w) => /^(w|d|dw|u|nvo|m|s|f|gnv)_/.test(w));
  return (pbLike.length > 0 ? [...pbLike, ...unique] : unique).slice(0, 8);
}

interface ObjectSummary {
  name: string;
  type: string;
  filePath: string;
}

interface SearchMatch {
  kind: 'ui_string' | 'event';
  matchedText: string;
  object: ObjectSummary;
  event: { owner: string; name: string; startLine: number; endLine: number } | null;
}

interface SearchResponse {
  count: number;
  matches: SearchMatch[];
}

interface EventBodyResponse {
  count: number;
  matches: {
    event: { owner: string; name: string; body: string; startLine: number; endLine: number };
  }[];
}

interface PbTicket {
  id: string;
  externalId: string;
  title: string;
  resolutionText: string;
}

interface SimilarTicketsResponse {
  count: number;
  results: { ticket: PbTicket; score: number }[];
}

async function pbInsightGet<T>(baseUrl: string, path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
    if (!resp.ok) throw new Error(`pb-insight respondeu ${resp.status}`);
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function pbInsightPost<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok && resp.status !== 409) {
      throw new Error(`pb-insight respondeu ${resp.status}: ${await resp.text()}`);
    }
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export interface RetrievedContext {
  text: string;
  /** false = a IA vai analisar sem nenhum trecho real de código (pb-insight fora
   * do ar, ou nada bateu). O card guarda isso pra UI avisar — análise sem
   * grounding soa tão confiante quanto uma com, e é aí que mora o risco. */
  grounded: boolean;
}

export async function retrieveContext(module: string, query: string): Promise<RetrievedContext> {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) {
    return {
      grounded: false,
      text: `// nenhum termo relevante extraído do texto pra buscar no PB Insight (módulo=${module}).`,
    };
  }

  const { pbInsightUrl } = await getSettings();
  const seen = new Set<string>();
  const blocks: string[] = [];

  /*
   * Primeiro as FRASES do chamado, encurtando até achar. A mensagem de tela é
   * a pista mais direta que existe — quando ela casa, aponta o objeto certo sem
   * depender de o suporte ter escrito o nome da janela.
   */
  const phraseTerms: string[] = [];
  for (const phrase of extractPhrases(query)) {
    for (const tentativa of phraseBackoff(phrase)) {
      try {
        const resp = await pbInsightGet<SearchResponse>(
          pbInsightUrl,
          `/search?q=${encodeURIComponent(tentativa)}&limit=5`,
        );
        if (resp.count > 0) {
          phraseTerms.push(tentativa);
          break; // achou com esta frase; não precisa encurtar mais
        }
      } catch {
        break; // pb-insight fora do ar: cai no caminho de palavras-chave
      }
    }
  }

  for (const kw of [...phraseTerms, ...keywords]) {
    if (blocks.length >= MAX_HITS) break;

    let search: SearchResponse;
    try {
      search = await pbInsightGet<SearchResponse>(pbInsightUrl, `/search?q=${encodeURIComponent(kw)}&limit=5`);
    } catch {
      continue; // pb-insight fora do ar ou lento — perde só esse termo, não derruba a análise
    }

    for (const match of search.matches) {
      if (blocks.length >= MAX_HITS) break;

      const dedupeKey = `${match.object.name}::${match.event?.name ?? match.kind}::${match.event?.owner ?? ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      if (match.kind === 'event' && match.event) {
        try {
          const eventResp = await pbInsightGet<EventBodyResponse>(
            pbInsightUrl,
            `/objects/${encodeURIComponent(match.object.name)}/events/${encodeURIComponent(match.event.name)}?owner=${encodeURIComponent(match.event.owner)}`,
          );
          const body = eventResp.matches[0]?.event.body;
          if (body) {
            blocks.push(
              `// ${match.object.filePath} :: ${match.object.name}.${match.event.owner}.${match.event.name} (linhas ${match.event.startLine}-${match.event.endLine})\n${body.slice(0, SNIPPET_CHARS)}`,
            );
            continue;
          }
        } catch {
          // segue pro fallback abaixo (registra o match sem o corpo do evento)
        }
      }

      blocks.push(
        `// ${match.object.filePath} :: ${match.object.name} (${match.object.type}) — match "${match.matchedText}" (${match.kind})`,
      );
    }
  }

  // Chamados parecidos já resolvidos — busca semântica (embedding), não por
  // palavra-chave. É o loop de feedback: precedente real pesa mais que só código.
  let similarBlock = '';
  try {
    const similar = await pbInsightGet<SimilarTicketsResponse>(
      pbInsightUrl,
      `/tickets/similar?q=${encodeURIComponent(query)}&limit=3`,
    );
    if (similar.results.length > 0) {
      similarBlock =
        '\n\n# Chamados parecidos já resolvidos (precedente real)\n' +
        similar.results
          .map((r) => `## ${r.ticket.externalId} — ${r.ticket.title}\n${r.ticket.resolutionText}`)
          .join('\n\n');
    }
  } catch {
    // base de tickets vazia, pb-insight fora do ar, etc — segue sem precedente
  }

  if (blocks.length === 0 && !similarBlock) {
    return {
      grounded: false,
      text: `// PB Insight não encontrou objetos pra: ${keywords.join(', ')} (módulo=${module}). Serviço em ${pbInsightUrl} está no ar?`,
    };
  }

  return { grounded: blocks.length > 0, text: blocks.join('\n\n') + similarBlock };
}

/**
 * Fecha o loop de feedback: quando o dev confirma RESOLVIDO, o card vira um
 * Ticket real no pb-insight (base de conhecimento, SPEC §13.5) + um link pra
 * cada objeto que a análise apontou como afetado. Best-effort de propósito —
 * nunca deve derrubar a confirmação de RESOLVIDO do dev por causa disso.
 */
export async function promoteResolvedTicket(card: Card): Promise<void> {
  const { pbInsightUrl } = await getSettings();

  const title = card.proposal?.summary ?? card.analysis?.rootCause ?? card.jiraKey;

  // A solução REAL do dev é a fonte de verdade aqui. O diff da IA só entra
  // quando ele não descreveu o que fez — se o dev corrigiu de outro jeito e a
  // gente gravasse a proposta da IA, a base de conhecimento aprenderia errado
  // e o sistema pioraria a cada chamado.
  const resolutionParts = [
    card.analysis?.rootCause ? `Causa raiz: ${card.analysis.rootCause}` : '',
    card.resolutionText
      ? `Solução aplicada pelo dev:\n${card.resolutionText}`
      : card.proposal?.diff
        ? `Diff proposto pela IA (dev não descreveu a solução real):\n${card.proposal.diff}`
        : '',
  ].filter(Boolean);
  const resolveNote = card.history[card.history.length - 1]?.note;
  if (resolveNote) resolutionParts.push(`Nota do dev: ${resolveNote}`);

  const ticket = await pbInsightPost<Partial<PbTicket>>(pbInsightUrl, '/tickets', {
    externalId: card.jiraKey,
    title,
    descriptionRaw: card.rawTicket,
    resolutionText: resolutionParts.join('\n\n') || 'Resolvido sem detalhes registrados.',
    module: card.module,
    resolvedAt: card.updatedAt,
  });
  if (!ticket.id) return; // 409 (já cadastrado) ou resposta inesperada — sem id, não dá pra linkar objetos

  for (const obj of card.analysis?.affectedObjects ?? []) {
    await pbInsightPost(pbInsightUrl, `/tickets/${ticket.id}/links`, {
      objectName: obj.name,
      notes: obj.reason,
    }).catch(() => {
      // objeto pode não bater com o nome real no grafo (nome vem do LLM) — ok, ignora esse link
    });
  }
}
