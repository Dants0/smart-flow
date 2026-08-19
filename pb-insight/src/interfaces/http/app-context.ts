import type { IDiagnosisRepository } from "../../application/ports/diagnosis-repository.port.js";
import type { IEmbeddingProvider } from "../../application/ports/embedding-provider.port.js";
import type { ILLMClient } from "../../application/ports/llm-client.port.js";
import type { IObjectRepository } from "../../application/ports/object-repository.port.js";
import type { ISearchIndex } from "../../application/ports/search-index.port.js";
import type { ISourceFileProvider } from "../../application/ports/source-file-provider.port.js";
import type { ITicketRepository } from "../../application/ports/ticket-repository.port.js";
import { OpenAIEmbeddingProvider } from "../../infrastructure/embeddings/openai-embedding-provider.js";
import { FsSourceFileProvider } from "../../infrastructure/filesystem/fs-source-file-provider.js";
import { IngestJobManager, type IIngestJobManager } from "../../infrastructure/ingest/ingest-job-manager.js";
import { JsonDiagnosisRepository } from "../../infrastructure/persistence/json-diagnosis-repository.js";
import { JsonObjectRepository } from "../../infrastructure/persistence/json-object-repository.js";
import { JsonTicketRepository } from "../../infrastructure/persistence/json-ticket-repository.js";
import { InMemorySearchIndex } from "../../infrastructure/search/in-memory-search-index.js";

/**
 * Composition root da camada HTTP — equivalente ao que cada comando CLI monta
 * inline, mas construído uma única vez na subida do servidor (o grafo de
 * ~16k objetos é carregado e o índice de busca é montado uma vez; cada
 * requisição só consulta estruturas em memória).
 *
 * `repository`/`searchIndex`/`graphPath` NÃO são `readonly`: `POST /reload` e
 * a conclusão de `POST /ingest` os reatribuem em memória (ver
 * reload-context.ts) — as rotas leem `ctx.repository`/`ctx.searchIndex` no
 * corpo do handler, então a troca vale a partir da próxima requisição, sem
 * reiniciar o processo.
 *
 * `createLLMClient` é uma fábrica, não uma instância fixa: cada chamada a
 * POST /diagnose pode escolher provedor/modelo (Claude ou GPT) por
 * requisição — nenhum dos dois adapters chama a rede na construção, só no
 * `synthesizeDiagnosis()`, então isso não tem custo de montar por requisição.
 */
export interface AppContext {
  repository: IObjectRepository;
  searchIndex: ISearchIndex;
  sourceFiles: ISourceFileProvider;
  createLLMClient: (provider?: string, model?: string) => ILLMClient;
  graphPath: string;
  snapshotsDir: string;
  wsObjectsRoot: string;
  ingestReportPath: string;
  ingestJobs: IIngestJobManager;
  ticketRepository: ITicketRepository;
  embeddings: IEmbeddingProvider;
  diagnosisRepository: IDiagnosisRepository;
}

export interface BuildAppContextOptions {
  graphPath: string;
  wsObjectsRoot: string;
  snapshotsDir: string;
  ingestReportPath: string;
  ticketsPath: string;
  diagnosesPath: string;
  createLLMClient: (provider?: string, model?: string) => ILLMClient;
}

export async function buildAppContext(options: BuildAppContextOptions): Promise<AppContext> {
  const repository = JsonObjectRepository.load(options.graphPath);
  const searchIndex = new InMemorySearchIndex(await repository.allObjects());
  const sourceFiles = new FsSourceFileProvider(options.wsObjectsRoot);

  return {
    repository,
    searchIndex,
    sourceFiles,
    createLLMClient: options.createLLMClient,
    graphPath: options.graphPath,
    snapshotsDir: options.snapshotsDir,
    wsObjectsRoot: options.wsObjectsRoot,
    ingestReportPath: options.ingestReportPath,
    ingestJobs: new IngestJobManager(),
    ticketRepository: JsonTicketRepository.load(options.ticketsPath),
    embeddings: new OpenAIEmbeddingProvider(),
    diagnosisRepository: JsonDiagnosisRepository.load(options.diagnosesPath),
  };
}
