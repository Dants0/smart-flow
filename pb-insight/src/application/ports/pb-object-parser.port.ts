import type { PBObject } from "../../domain/entities/pb-object.js";
import type { PBObjectType } from "../../domain/value-objects/pb-object-type.js";
import type { Result } from "../../domain/value-objects/result.js";

export interface ParseError {
  filePath: string;
  reason: string;
}

export interface IPBObjectParser {
  readonly supportedType: PBObjectType;
  parse(rawSource: string, filePath: string): Result<PBObject, ParseError>;
}
