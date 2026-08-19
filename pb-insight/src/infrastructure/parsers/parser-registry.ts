import type { IPBObjectParser } from "../../application/ports/pb-object-parser.port.js";
import { EXTENSION_TO_TYPE } from "../../domain/value-objects/pb-object-type.js";
import { DataWindowParser } from "./datawindow-parser.js";
import { FunctionParser } from "./function-parser.js";
import {
  ApplicationParser,
  MenuParser,
  PipelineParser,
  ProjectParser,
  ProxyParser,
  QueryParser,
  StructureParser,
} from "./simple-parsers.js";
import { UserObjectParser } from "./userobject-parser.js";
import { WindowParser } from "./window-parser.js";

/**
 * Resolve o parser pela extensão do arquivo (OCP: suporte a novo tipo de
 * objeto = nova classe registrada aqui, sem tocar no orquestrador).
 */
export class ParserRegistry {
  private readonly byType = new Map(
    [
      new WindowParser(),
      new UserObjectParser(),
      new DataWindowParser(),
      new FunctionParser(),
      new MenuParser(),
      new StructureParser(),
      new ApplicationParser(),
      new QueryParser(),
      new ProjectParser(),
      new PipelineParser(),
      new ProxyParser(),
    ].map((p): [string, IPBObjectParser] => [p.supportedType, p]),
  );

  parserFor(filePath: string): IPBObjectParser | null {
    const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
    const type = EXTENSION_TO_TYPE[ext];
    return type ? (this.byType.get(type) ?? null) : null;
  }
}
