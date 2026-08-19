import type { ISearchIndex, SearchMatch } from "../../ports/search-index.port.js";
import type { PBObjectType } from "../../../domain/value-objects/pb-object-type.js";

export class SearchUseCase {
  constructor(private readonly index: ISearchIndex) {}

  execute(query: string, limit = 20, types?: PBObjectType[]): SearchMatch[] {
    return this.index.search(query, limit, types);
  }
}
