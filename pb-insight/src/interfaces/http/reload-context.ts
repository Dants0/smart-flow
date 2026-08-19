import { JsonObjectRepository } from "../../infrastructure/persistence/json-object-repository.js";
import { InMemorySearchIndex } from "../../infrastructure/search/in-memory-search-index.js";
import type { AppContext } from "./app-context.js";

export interface ReloadResult {
  objectCount: number;
  versionLabel: string;
  ingestedAt: string | null;
}

/**
 * Recarrega o repositório + índice de busca a partir do graph.json —
 * mutando o MESMO objeto `ctx` (não retorna um novo AppContext). As rotas já
 * leem `ctx.repository`/`ctx.searchIndex` no corpo do handler (não capturam
 * uma cópia no registro da rota), então a próxima requisição já vê os dados
 * novos sem precisar reiniciar o servidor.
 */
export async function reloadContext(ctx: AppContext, graphPath?: string): Promise<ReloadResult> {
  const path = graphPath ?? ctx.graphPath;
  const repository = JsonObjectRepository.load(path);
  const searchIndex = new InMemorySearchIndex(await repository.allObjects());

  ctx.repository = repository;
  ctx.searchIndex = searchIndex;
  ctx.graphPath = path;

  const version = await repository.getVersion();
  return {
    objectCount: version?.objectCount ?? 0,
    versionLabel: version?.label ?? "",
    ingestedAt: version?.ingestedAt ?? null,
  };
}
