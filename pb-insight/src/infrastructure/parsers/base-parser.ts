import type { IPBObjectParser, ParseError } from "../../application/ports/pb-object-parser.port.js";
import type { PBObject, PBStructuredContent } from "../../domain/entities/pb-object.js";
import type { PBObjectType } from "../../domain/value-objects/pb-object-type.js";
import { err, ok, type Result } from "../../domain/value-objects/result.js";
import {
  exportHeaderName,
  globalTypeDeclaration,
  libraryFromPath,
  objectId,
  sha256,
  stripBom,
} from "./powerscript-source.js";

/**
 * Fluxo comum a todos os parsers: nome (header de export, com fallback para o
 * nome do arquivo), ancestral, identidade e hash. Cada subtipo contribui só a
 * extração estruturada específica (Template Method).
 */
export abstract class BasePBObjectParser implements IPBObjectParser {
  abstract readonly supportedType: PBObjectType;

  protected abstract extractStructured(source: string, name: string): PBStructuredContent;

  parse(rawSource: string, filePath: string): Result<PBObject, ParseError> {
    const source = stripBom(rawSource);

    const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
    const nameFromFile = fileName.replace(/\.\w+$/, "").toLowerCase();
    const name = exportHeaderName(source) ?? nameFromFile;
    if (!name) {
      return err({ filePath, reason: "não foi possível determinar o nome do objeto" });
    }

    const declaration = globalTypeDeclaration(source);
    const library = libraryFromPath(filePath);

    return ok({
      id: objectId(library, name),
      type: this.supportedType,
      name,
      ancestor: declaration?.ancestor ?? null,
      library,
      filePath,
      contentHash: sha256(source),
      structured: this.extractStructured(source, name),
    });
  }
}
