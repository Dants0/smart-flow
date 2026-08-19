import type { PBEventBlock } from "../../domain/entities/pb-object.js";

/**
 * Extrai cada evento/função/subrotina individual de um .srw/.sru/.srf,
 * mantendo o controle "dono" corrente conforme o arquivo avança.
 *
 * Estrutura real do formato de export (confirmada contra o repo real):
 *
 *   forward                              <- puro esqueleto, sem corpo — pular inteiro
 *     type X from Y within Z
 *     end type
 *   end forward
 *
 *   global type <root> from <ancestral>  <- SEM "within": não troca o dono
 *   ...propriedades...
 *   end type
 *
 *   type variables ... end variables     <- variáveis de instância — pular
 *   forward prototypes ... end prototypes <- só assinaturas, sem corpo — pular
 *
 *   [public|global] function <tipo> <nome> (...);<corpo>
 *   end function
 *
 *   event <nome>;call super::<nome>;<corpo>
 *   end event
 *
 *   type <nome> from <tipo> within <pai>  <- COM "within": troca o dono para <nome>
 *   ...propriedades...
 *   end type
 *   [eventos/funções do controle <nome>...]
 *
 * O dono inicial é o próprio objeto (root); cada `type X from Y within Z`
 * (fora do bloco forward) troca o dono para X até a próxima ocorrência.
 */

const OWNER_SWITCH = /^type\s+(\w+)\s+from\s+\w+\s+within\s+\w+/i;
const EVENT_START = /^event\s+(\w+)\s*;(?:call\s+super::\w+\s*;)?(.*)$/i;
const FUNCTION_START = /^(?:global|public|private|protected)?\s*function\s+\S+(?:\s+\S+)*\s+(\w+)\s*\(/i;
const SUBROUTINE_START = /^(?:global|public|private|protected)?\s*subroutine\s+(\w+)\s*\(/i;

export function extractEventBlocks(source: string, rootName: string): PBEventBlock[] {
  const lines = source.split(/\r\n|\n/);
  const blocks: PBEventBlock[] = [];
  let owner = rootName.toLowerCase();
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i]!.trim();

    if (/^forward\s+prototypes\s*$/i.test(trimmed)) {
      i = skipUntil(lines, i + 1, /^end\s+prototypes\s*$/i);
      continue;
    }
    if (/^forward\s*$/i.test(trimmed)) {
      i = skipUntil(lines, i + 1, /^end\s+forward\s*$/i);
      continue;
    }
    if (/^type\s+variables\s*$/i.test(trimmed)) {
      i = skipUntil(lines, i + 1, /^end\s+variables\s*$/i);
      continue;
    }

    const ownerMatch = trimmed.match(OWNER_SWITCH);
    if (ownerMatch) {
      owner = ownerMatch[1]!.toLowerCase();
      i++;
      continue;
    }

    const eventMatch = trimmed.match(EVENT_START);
    if (eventMatch) {
      const { body, endIndex } = collectBlockBody(lines, i, eventMatch[2] ?? "", /^end\s+event\s*$/i);
      blocks.push({
        kind: "event",
        owner,
        name: eventMatch[1]!.toLowerCase(),
        body,
        startLine: i + 1,
        endLine: endIndex + 1,
      });
      i = endIndex + 1;
      continue;
    }

    const funcMatch = trimmed.match(FUNCTION_START);
    const subMatch = funcMatch ? null : trimmed.match(SUBROUTINE_START);
    if (funcMatch || subMatch) {
      const kind = funcMatch ? "function" : "subroutine";
      const name = (funcMatch ?? subMatch)![1]!.toLowerCase();
      const sigEnd = trimmed.indexOf(");");
      const firstChunk = sigEnd >= 0 ? trimmed.slice(sigEnd + 2) : "";
      const endPattern = kind === "function" ? /^end\s+function\s*$/i : /^end\s+subroutine\s*$/i;
      const { body, endIndex } = collectBlockBody(lines, i, firstChunk, endPattern);
      blocks.push({ kind, owner, name, body, startLine: i + 1, endLine: endIndex + 1 });
      i = endIndex + 1;
      continue;
    }

    i++;
  }

  return blocks;
}

function skipUntil(lines: string[], from: number, endPattern: RegExp): number {
  let i = from;
  while (i < lines.length && !endPattern.test(lines[i]!.trim())) i++;
  return i + 1;
}

function collectBlockBody(
  lines: string[],
  startIndex: number,
  firstChunk: string,
  endPattern: RegExp,
): { body: string; endIndex: number } {
  const bodyLines: string[] = [];
  if (firstChunk.trim().length > 0) bodyLines.push(firstChunk);
  let i = startIndex + 1;
  while (i < lines.length && !endPattern.test(lines[i]!.trim())) {
    bodyLines.push(lines[i]!);
    i++;
  }
  return { body: bodyLines.join("\n").trim(), endIndex: i };
}
