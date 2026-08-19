import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CodebaseVersion } from "../../domain/entities/codebase-version.js";
import type { ObjectDependency } from "../../domain/entities/object-dependency.js";
import type { PBObject } from "../../domain/entities/pb-object.js";
import type { IObjectRepository } from "../../application/ports/object-repository.port.js";

interface SnapshotFile {
  version: CodebaseVersion;
  objects: PBObject[];
  dependencies: ObjectDependency[];
}

/**
 * Repositório em memória com persistência num único JSON.
 * Serve o ciclo atual (ingestão completa por chamado, pós-pull); o adapter
 * Postgres da seção 7 do SPEC substitui esta classe atrás da mesma porta,
 * sem tocar nos use cases (DIP).
 *
 * Nota: o snapshot NÃO guarda rawContent — o fonte permanece no ws_objects,
 * referenciado por filePath. Isso mantém o JSON pequeno (~dezenas de MB para
 * o repo inteiro viraria ~300MB se o fonte fosse embutido).
 */
export class JsonObjectRepository implements IObjectRepository {
  private version: CodebaseVersion | null = null;
  private objectsById = new Map<string, PBObject>();
  private objectsByName = new Map<string, PBObject[]>();
  private outgoing = new Map<string, ObjectDependency[]>();
  private incoming = new Map<string, ObjectDependency[]>();
  private dependencyCount = 0;

  constructor(private readonly storagePath?: string) {}

  static load(storagePath: string): JsonObjectRepository {
    const repo = new JsonObjectRepository(storagePath);
    const raw = JSON.parse(readFileSync(storagePath, "utf-8")) as SnapshotFile;
    repo.index(raw.version, raw.objects, raw.dependencies);
    return repo;
  }

  async saveSnapshot(
    version: CodebaseVersion,
    objects: PBObject[],
    dependencies: ObjectDependency[],
  ): Promise<void> {
    this.index(version, objects, dependencies);
    if (this.storagePath) {
      mkdirSync(dirname(this.storagePath), { recursive: true });
      const file: SnapshotFile = { version, objects, dependencies };
      writeFileSync(this.storagePath, JSON.stringify(file), "utf-8");
    }
  }

  private index(
    version: CodebaseVersion,
    objects: PBObject[],
    dependencies: ObjectDependency[],
  ): void {
    this.version = version;
    this.objectsById = new Map(objects.map((o) => [o.id, o]));
    this.objectsByName = new Map();
    for (const obj of objects) {
      const list = this.objectsByName.get(obj.name);
      if (list) list.push(obj);
      else this.objectsByName.set(obj.name, [obj]);
    }
    this.outgoing = new Map();
    this.incoming = new Map();
    for (const dep of dependencies) {
      pushTo(this.outgoing, dep.fromId, dep);
      pushTo(this.incoming, dep.toId, dep);
    }
    this.dependencyCount = dependencies.length;
  }

  async getVersion(): Promise<CodebaseVersion | null> {
    return this.version;
  }

  async findByName(name: string): Promise<PBObject[]> {
    return this.objectsByName.get(name.toLowerCase()) ?? [];
  }

  async findById(id: string): Promise<PBObject | null> {
    return this.objectsById.get(id) ?? null;
  }

  async allObjects(): Promise<PBObject[]> {
    return [...this.objectsById.values()];
  }

  async dependenciesOf(objectId: string): Promise<ObjectDependency[]> {
    return this.outgoing.get(objectId) ?? [];
  }

  async dependentsOf(objectId: string): Promise<ObjectDependency[]> {
    return this.incoming.get(objectId) ?? [];
  }

  async countObjects(): Promise<number> {
    return this.objectsById.size;
  }

  async countDependencies(): Promise<number> {
    return this.dependencyCount;
  }
}

function pushTo(map: Map<string, ObjectDependency[]>, key: string, dep: ObjectDependency): void {
  const list = map.get(key);
  if (list) list.push(dep);
  else map.set(key, [dep]);
}
