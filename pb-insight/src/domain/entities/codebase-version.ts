export interface CodebaseVersion {
  id: string;
  /** Rótulo da versão (ex: "26.2.03A") ou timestamp da ingestão. */
  label: string;
  ingestedAt: string;
  /** Hash agregado dos content hashes de todos os objetos do snapshot. */
  sourceHash: string;
  objectCount: number;
}
