export type PBObjectType =
  | "Window"
  | "DataWindow"
  | "Function"
  | "Menu"
  | "UserObject"
  | "Structure"
  | "Application"
  | "Query"
  | "Project"
  | "Pipeline"
  | "Proxy";

/** Todos os tipos válidos, na mesma ordem de EXTENSION_TO_TYPE — usado para validar filtros (ex.: GET /search?types=). */
export const PB_OBJECT_TYPES: PBObjectType[] = [
  "Window",
  "DataWindow",
  "Function",
  "Menu",
  "UserObject",
  "Structure",
  "Application",
  "Query",
  "Project",
  "Pipeline",
  "Proxy",
];

// Extensão do arquivo exportado → tipo de objeto PowerBuilder.
// Cobertura verificada contra o repo real (2026-07-24): estas 11 extensões
// são as únicas presentes em ws_objects (Get-ChildItem -Recurse, contagem
// batendo 1:1 com objectCount da ingestão) — ver docs/08.
export const EXTENSION_TO_TYPE: Record<string, PBObjectType> = {
  ".srw": "Window",
  ".srd": "DataWindow",
  ".srf": "Function",
  ".srm": "Menu",
  ".sru": "UserObject",
  ".srs": "Structure",
  ".sra": "Application",
  ".srq": "Query",
  ".srj": "Project",
  ".srp": "Pipeline",
  ".srx": "Proxy",
};
