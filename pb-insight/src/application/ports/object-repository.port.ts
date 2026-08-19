import type { CodebaseVersion } from "../../domain/entities/codebase-version.js";
import type { ObjectDependency } from "../../domain/entities/object-dependency.js";
import type { PBObject } from "../../domain/entities/pb-object.js";

export interface IObjectRepository {
  saveSnapshot(
    version: CodebaseVersion,
    objects: PBObject[],
    dependencies: ObjectDependency[],
  ): Promise<void>;

  getVersion(): Promise<CodebaseVersion | null>;

  /** Busca por nome; retorna todas as ocorrências (pode haver colisão entre PBLs). */
  findByName(name: string): Promise<PBObject[]>;

  findById(id: string): Promise<PBObject | null>;

  /** Todos os objetos do snapshot — alimenta o SearchIndex e o diff de versões. */
  allObjects(): Promise<PBObject[]>;

  /** Arestas saindo de `objectId` (de quem ele depende). */
  dependenciesOf(objectId: string): Promise<ObjectDependency[]>;

  /** Arestas chegando em `objectId` (quem depende dele). */
  dependentsOf(objectId: string): Promise<ObjectDependency[]>;

  countObjects(): Promise<number>;
  countDependencies(): Promise<number>;
}
