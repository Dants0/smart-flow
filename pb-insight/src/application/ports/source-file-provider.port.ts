export interface SourceFile {
  /** Caminho relativo à raiz varrida (ex: "agenda50/ag_conf/ag_conf.pbl.src/w_confirm_agm.srw"). */
  relativePath: string;
  content: string;
}

/** Abstrai o filesystem — em teste, um provider fake devolve fixtures. */
export interface ISourceFileProvider {
  /** Lista e lê todos os arquivos-fonte PB (.sr?) sob a raiz. */
  readAll(): Promise<SourceFile[]>;
  /** Relê um único arquivo pelo caminho relativo (para dump de contexto). */
  readOne(relativePath: string): Promise<string>;
}
