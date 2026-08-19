import type { CardTraceFile } from "./types";

const MAX_TRACE_FILES = 3;
const MAX_TRACE_BYTES = 8 * 1024 * 1024; // 8MB por arquivo de trace

export function fileToTraceFile(file: File): Promise<CardTraceFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, content: reader.result as string });
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Converte arquivos de trace válidos (<8MB), respeitando o teto de anexos. */
export async function filesToTraceFiles(
  files: File[],
  current: CardTraceFile[],
): Promise<{ traceFiles: CardTraceFile[]; skipped: number }> {
  const room = Math.max(0, MAX_TRACE_FILES - current.length);
  const valid = files.filter((f) => f.size <= MAX_TRACE_BYTES);
  const accepted = valid.slice(0, room);
  const converted = await Promise.all(accepted.map(fileToTraceFile));
  return {
    traceFiles: [...current, ...converted],
    skipped: files.length - accepted.length,
  };
}

export { MAX_TRACE_FILES };
