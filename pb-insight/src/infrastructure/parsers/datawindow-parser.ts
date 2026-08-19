import type { DataWindowColumn, PBStructuredContent } from "../../domain/entities/pb-object.js";
import type { PBObjectType } from "../../domain/value-objects/pb-object-type.js";
import { BasePBObjectParser } from "./base-parser.js";
import { uiStrings, unescapePBString } from "./powerscript-source.js";

export class DataWindowParser extends BasePBObjectParser {
  readonly supportedType: PBObjectType = "DataWindow";

  protected extractStructured(source: string): PBStructuredContent {
    return {
      columns: extractColumns(source),
      retrieveSql: extractRetrieveSql(source),
      uiStrings: uiStrings(source),
    };
  }
}

/**
 * Colunas de um .srd: `column=(type=... name=xxx dbname="..." values="..." ...)`.
 * A primeira coluna pode vir colada na abertura do bloco (`table(column=(...`),
 * por isso o match não é ancorado no início da linha.
 * A code table vem em values="Display~tData/Display~tData".
 */
function extractColumns(source: string): DataWindowColumn[] {
  const columns: DataWindowColumn[] = [];
  for (const m of source.matchAll(/\bcolumn=\((.*)$/gim)) {
    const body = m[1]!;
    const name = body.match(/\bname=(\w+)/i)?.[1];
    if (!name) continue;

    const column: DataWindowColumn = { name: name.toLowerCase() };

    const dbName = body.match(/\bdbname="((?:~"|[^"])+)"/i)?.[1];
    if (dbName) column.dbName = unescapePBString(dbName);

    const values = body.match(/\bvalues="((?:~"|[^"])+)"/i)?.[1];
    if (values) {
      const pairs = unescapePBString(values)
        .split("/")
        .map((pair) => {
          const [display = "", data = ""] = pair.split("\t");
          return { display: display.trim(), data: data.trim() };
        })
        .filter((p) => p.display.length > 0);
      if (pairs.length > 0) column.codeTable = pairs;
    }

    columns.push(column);
  }
  return columns;
}

function extractRetrieveSql(source: string): string | undefined {
  const m = source.match(/\bretrieve\s*=\s*"((?:~"|[^"])+)"/i);
  return m ? unescapePBString(m[1]!) : undefined;
}
