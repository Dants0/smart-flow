import { spawn as nodeSpawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export type IngestJobStatus = "idle" | "running" | "done" | "error";

export interface IngestReport {
  label: string;
  versionId: string;
  objectCount: number;
  dependencyCount: number;
  skippedCount: number;
  durationMs: number;
}

export interface IngestJobState {
  status: IngestJobStatus;
  startedAt?: string;
  finishedAt?: string;
  report?: IngestReport;
  error?: string;
}

export interface StartIngestOptions {
  rootDir: string;
  label?: string;
  graphPath: string;
  reportPath: string;
  onDone?: (report: IngestReport) => void | Promise<void>;
}

/** Mesma superfície de `child_process.spawn` — injetável para testar sem subir um processo real. */
export type SpawnFn = typeof nodeSpawn;

export interface IIngestJobManager {
  start(options: StartIngestOptions): IngestJobState | null;
  getState(): IngestJobState;
}

/**
 * Roda `npm run ingest` (o mesmo CLI já testado e validado contra o repo
 * real) num processo filho — CPU-bound síncrono de ~40-50s rodando fora do
 * event loop do servidor, que continua respondendo outras requisições
 * normalmente. Um job por vez; chamar `start()` com um já em andamento
 * retorna `null` (o route handler responde 409).
 *
 * Comunicação de resultado é via arquivo JSON (`--report`), não parsing de
 * stdout — frágil e desnecessário quando o próprio CLI já pode escrever o
 * relatório estruturado.
 */
export class IngestJobManager implements IIngestJobManager {
  private state: IngestJobState = { status: "idle" };
  private running = false;

  constructor(private readonly spawnFn: SpawnFn = nodeSpawn) {}

  getState(): IngestJobState {
    return this.state;
  }

  start(options: StartIngestOptions): IngestJobState | null {
    if (this.running) return null;
    this.running = true;
    this.state = { status: "running", startedAt: new Date().toISOString() };

    // spawn com shell:true (necessário no Windows pra resolver npx.cmd) NÃO
    // cita automaticamente argumentos com espaço — "C:\controle de versão\..."
    // quebraria em vários argumentos separados no cmd.exe. Citamos manualmente.
    const quote = (arg: string) => (arg.includes(" ") ? `"${arg}"` : arg);
    const args = [
      "tsx",
      "src/interfaces/cli/ingest.command.ts",
      quote(options.rootDir),
      "--out",
      quote(options.graphPath),
      "--report",
      quote(options.reportPath),
    ];
    if (options.label) args.push("--label", quote(options.label));

    const child = this.spawnFn("npx", args, { cwd: process.cwd(), shell: true });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      this.running = false;
      if (code === 0 && existsSync(options.reportPath)) {
        const report = JSON.parse(readFileSync(options.reportPath, "utf-8")) as IngestReport;
        this.state = { status: "done", startedAt: this.state.startedAt, finishedAt: new Date().toISOString(), report };
        void options.onDone?.(report);
      } else {
        this.state = {
          status: "error",
          startedAt: this.state.startedAt,
          finishedAt: new Date().toISOString(),
          error: stderr.trim() || `processo de ingestão saiu com código ${code}`,
        };
      }
    });

    child.on("error", (err) => {
      this.running = false;
      this.state = {
        status: "error",
        startedAt: this.state.startedAt,
        finishedAt: new Date().toISOString(),
        error: err.message,
      };
    });

    return this.state;
  }
}
