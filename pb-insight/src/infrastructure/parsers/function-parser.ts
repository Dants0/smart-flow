import type { PBStructuredContent } from "../../domain/entities/pb-object.js";
import type { PBObjectType } from "../../domain/value-objects/pb-object-type.js";
import { BasePBObjectParser } from "./base-parser.js";
import { extractEventBlocks } from "./event-extractor.js";

export class FunctionParser extends BasePBObjectParser {
  readonly supportedType: PBObjectType = "Function";

  protected extractStructured(source: string, name: string): PBStructuredContent {
    const m = source.match(/^global\s+(?:function|subroutine)\b[^;\n]*/im);
    const events = extractEventBlocks(source, name);
    return {
      ...(m ? { signature: m[0].trim() } : {}),
      ...(events.length > 0 ? { events } : {}),
    };
  }
}
