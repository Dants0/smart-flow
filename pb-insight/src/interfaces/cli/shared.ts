/**
 * Onde estão os fontes exportados do SMART Desktop. O caminho varia por
 * máquina (e é outro dentro do container), então vem de `PB_INSIGHT_WS_ROOT`.
 * O fallback é o layout padrão de quem clona o repo no Windows — todo comando
 * ainda aceita sobrescrever via argumento/flag.
 */
export const DEFAULT_WS_OBJECTS_ROOT =
  process.env["PB_INSIGHT_WS_ROOT"] ?? "C:\\controle de versão\\smart_desktop\\ws_objects";

export const DEFAULT_GRAPH_PATH = ".data/graph.json";
export const DEFAULT_SNAPSHOTS_DIR = ".data/snapshots";
export const DEFAULT_INGEST_REPORT_PATH = ".data/last-ingest-report.json";
export const DEFAULT_TICKETS_PATH = ".data/tickets.json";
export const DEFAULT_DIAGNOSES_PATH = ".data/diagnoses.json";

/** Nome de arquivo seguro a partir do label da versão + id, para o histórico de snapshots. */
export function snapshotFileName(label: string, versionId: string): string {
  const slug = label
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "versao"}-${versionId}.json`;
}

export function parseArgs(argv: string[]): {
  positional: string[];
  flags: Record<string, string>;
} {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[name] = next;
        i++;
      } else {
        flags[name] = "true";
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}
