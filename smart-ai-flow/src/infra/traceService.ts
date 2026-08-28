import type { TraceFileAnalysis } from '../domain/card';
import { getSettings } from './settingsRepository';

/**
 * Cliente do microserviço app_trace (Go): parseia logs de trace de banco/PowerBuilder
 * e devolve um diagnóstico estratégico por arquivo. É o que torna a análise da IA
 * mais assertiva quando o chamado vem com trace anexado.
 *
 * Por padrão reaproveita a chave e o modelo Anthropic configurados na tela de
 * Configurações. Opcionalmente aceita um `override` — chave PESSOAL digitada pelo
 * dev na UI, só pra teste, nunca persistida no card nem no banco (ver /cards em
 * routes.ts). O app_trace roteia por substring no nome do modelo, então o
 * mapeamento abaixo espelha essa regra.
 */
interface TraceServiceResult {
  filename: string;
  event_count: number;
  strategic_analysis: string;
}

export interface TraceProviderOverride {
  modelAi: string; // ex: 'gpt-4o', 'gemini-1.5-flash', 'llama-3.1-70b-versatile'
  apiKey: string;
  azureEndpoint?: string; // só quando modelAi contém 'copilot'
}

function appendApiKey(form: FormData, modelAi: string, apiKey: string, azureEndpoint?: string) {
  if (modelAi.includes('gemini')) {
    form.append('key_gemini', apiKey);
  } else if (modelAi.includes('claude')) {
    form.append('key_anthropic', apiKey);
  } else if (modelAi.includes('llama')) {
    form.append('key_groq', apiKey);
  } else if (modelAi.includes('copilot')) {
    form.append('key_azure', apiKey);
    if (azureEndpoint) form.append('key_azure_ep', azureEndpoint);
  } else {
    form.append('key_openai', apiKey);
  }
}

export async function analyzeTraces(
  files: { name: string; content: string }[],
  bugDescription: string,
  override?: TraceProviderOverride,
): Promise<TraceFileAnalysis[]> {
  if (files.length === 0) return [];

  const settings = await getSettings();
  const modelAi = override?.modelAi || settings.model;

  const form = new FormData();
  for (const file of files) {
    form.append('files', new Blob([file.content], { type: 'text/plain' }), file.name);
  }
  form.append('bugDescription', bugDescription);
  form.append('modelAi', modelAi);

  if (override?.apiKey) {
    appendApiKey(form, modelAi, override.apiKey, override.azureEndpoint);
  } else if (settings.anthropicCredential) {
    // O app_trace fala com a Anthropic por conta própria, então precisa saber o
    // tipo da credencial tanto quanto este backend — o campo diz em qual header
    // ele deve mandar o segredo.
    form.append(
      settings.anthropicAuthType === 'oauth' ? 'key_anthropic_oauth' : 'key_anthropic',
      settings.anthropicCredential,
    );
  }

  const resp = await fetch(`${settings.traceServiceUrl}/analyze-trace`, {
    method: 'POST',
    body: form,
  });

  if (!resp.ok) {
    throw new Error(`app_trace respondeu ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as TraceServiceResult[];
  return data.map((d) => ({
    filename: d.filename,
    eventCount: d.event_count,
    strategicAnalysis: d.strategic_analysis,
  }));
}
