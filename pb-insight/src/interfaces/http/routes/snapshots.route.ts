import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { DiffVersionsUseCase } from "../../../application/use-cases/diff-versions/diff-versions.use-case.js";
import { JsonObjectRepository } from "../../../infrastructure/persistence/json-object-repository.js";
import type { AppContext } from "../app-context.js";

interface DiffQuery {
  from: string;
  to?: string;
  only?: "added" | "removed" | "modified";
  contains?: string;
}

export function registerSnapshotRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get(
    "/snapshots",
    {
      schema: {
        tags: ["versioning"],
        summary: "Lista snapshots históricos disponíveis (gerados a cada `npm run ingest`)",
      },
    },
    async () => {
      const entries = listSnapshots(ctx.snapshotsDir);
      return { snapshots: entries };
    },
  );

  app.get<{ Querystring: DiffQuery }>(
    "/diff",
    {
      schema: {
        tags: ["versioning"],
        summary: "Diferenças entre dois snapshots (ou um snapshot e o grafo atual)",
        description:
          'Compara por content_hash — barato, sem reprocessar texto. Use GET /snapshots para descobrir os nomes válidos de "from"/"to". Omitir "to" compara contra o grafo carregado em memória agora.',
        querystring: {
          type: "object",
          required: ["from"],
          properties: {
            from: { type: "string", description: "Nome do arquivo em /snapshots (sem caminho)" },
            to: { type: "string", description: "Nome do arquivo em /snapshots, ou omitido para o grafo atual" },
            only: { type: "string", enum: ["added", "removed", "modified"] },
            contains: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { from, to, only, contains } = request.query;

      const fromPath = resolveSnapshotPath(ctx.snapshotsDir, from);
      if (!fromPath) {
        return reply.code(400).send({ error: `Snapshot "${from}" inválido ou não encontrado.` });
      }

      let toObjects;
      if (to) {
        const toPath = resolveSnapshotPath(ctx.snapshotsDir, to);
        if (!toPath) return reply.code(400).send({ error: `Snapshot "${to}" inválido ou não encontrado.` });
        toObjects = await JsonObjectRepository.load(toPath).allObjects();
      } else {
        toObjects = await ctx.repository.allObjects();
      }

      const fromObjects = await JsonObjectRepository.load(fromPath).allObjects();
      let entries = new DiffVersionsUseCase().execute(fromObjects, toObjects);
      if (only) entries = entries.filter((e) => e.changeType === only);
      if (contains) {
        const needle = contains.toLowerCase();
        entries = entries.filter((e) => e.name.includes(needle));
      }

      const counts = { added: 0, removed: 0, modified: 0 };
      for (const e of entries) counts[e.changeType]++;

      return { from, to: to ?? "current", counts, entries };
    },
  );
}

function listSnapshots(snapshotsDir: string): Array<{ file: string; mtime: string }> {
  let files: string[];
  try {
    files = readdirSync(snapshotsDir);
  } catch {
    return [];
  }
  return files
    .map((file) => ({ file, mtime: statSync(join(snapshotsDir, file)).mtime.toISOString() }))
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

/** Impede path traversal: só aceita nome de arquivo (sem separadores) dentro de snapshotsDir. */
function resolveSnapshotPath(snapshotsDir: string, fileName: string): string | null {
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) return null;
  const path = join(snapshotsDir, fileName);
  try {
    statSync(path);
    return path;
  } catch {
    return null;
  }
}
