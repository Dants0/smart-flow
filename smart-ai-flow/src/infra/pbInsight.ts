import { getSettings } from './settingsRepository';

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
const SNIPPET_CHARS = 3000;

const STOPWORDS = new Set([
  'para', 'como', 'sistema', 'chamado', 'incidente', 'erro', 'quando', 'depois',
  'antes', 'tela', 'clicar', 'abrir', 'modulo', 'módulo', 'usuario', 'usuário',
  'versao', 'versão', 'passo', 'realizar', 'realizado', 'apresenta', 'apresentando',
  'houve', 'solucao', 'solução', 'contorno', 'reproduzido', 'ocorre', 'diferente',
  'observacao', 'observação', 'disposicao', 'disposição', 'esclarecimentos',
]);

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

export async function retrieveContext(module: string, query: string): Promise<string> {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) {
    return `// nenhum termo relevante extraído do texto pra buscar no PB Insight (módulo=${module}).`;
  }

  const { pbInsightUrl } = await getSettings();
  const seen = new Set<string>();
  const blocks: string[] = [];

  for (const kw of keywords) {
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

  if (blocks.length === 0) {
    return `// PB Insight não encontrou objetos pra: ${keywords.join(', ')} (módulo=${module}). Serviço em ${pbInsightUrl} está no ar?`;
  }

  return blocks.join('\n\n');
}
