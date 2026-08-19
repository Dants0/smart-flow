import type { PBStructuredContent } from "../../domain/entities/pb-object.js";
import type { PBObjectType } from "../../domain/value-objects/pb-object-type.js";
import { BasePBObjectParser } from "./base-parser.js";
import { extractEventBlocks } from "./event-extractor.js";
import { dataObjectRefs, embeddedControls, uiStrings } from "./powerscript-source.js";

export class UserObjectParser extends BasePBObjectParser {
  readonly supportedType: PBObjectType = "UserObject";

  protected extractStructured(source: string, name: string): PBStructuredContent {
    return {
      controls: embeddedControls(source),
      dataObjects: dataObjectRefs(source),
      uiStrings: uiStrings(source),
      events: extractEventBlocks(source, name),
    };
  }
}
