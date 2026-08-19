import type { PBStructuredContent } from "../../domain/entities/pb-object.js";
import type { PBObjectType } from "../../domain/value-objects/pb-object-type.js";
import { BasePBObjectParser } from "./base-parser.js";
import { uiStrings } from "./powerscript-source.js";

/**
 * Tipos cuja extração estruturada por ora é só nome/ancestral/UI-strings.
 * Cada um permanece uma classe própria (SRP): quando o Menu precisar de
 * extração de itens, por exemplo, só o MenuParser muda.
 */

export class MenuParser extends BasePBObjectParser {
  readonly supportedType: PBObjectType = "Menu";
  protected extractStructured(source: string): PBStructuredContent {
    return { uiStrings: uiStrings(source) };
  }
}

export class StructureParser extends BasePBObjectParser {
  readonly supportedType: PBObjectType = "Structure";
  protected extractStructured(): PBStructuredContent {
    return {};
  }
}

export class ApplicationParser extends BasePBObjectParser {
  readonly supportedType: PBObjectType = "Application";
  protected extractStructured(): PBStructuredContent {
    return {};
  }
}

export class QueryParser extends BasePBObjectParser {
  readonly supportedType: PBObjectType = "Query";
  protected extractStructured(): PBStructuredContent {
    return {};
  }
}

export class ProjectParser extends BasePBObjectParser {
  readonly supportedType: PBObjectType = "Project";
  protected extractStructured(): PBStructuredContent {
    return {};
  }
}

export class PipelineParser extends BasePBObjectParser {
  readonly supportedType: PBObjectType = "Pipeline";
  protected extractStructured(): PBStructuredContent {
    return {};
  }
}

/** Proxy Object (.srx) — wrapper de COM/EJB (`global type X from NonVisualObject`). Raro (3 no repo real). */
export class ProxyParser extends BasePBObjectParser {
  readonly supportedType: PBObjectType = "Proxy";
  protected extractStructured(): PBStructuredContent {
    return {};
  }
}
