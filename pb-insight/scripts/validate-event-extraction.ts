// Validação pontual (descartável): confirma que o extrator de eventos isola
// corretamente o evento zoom de dw_agm18tab no fixture de validação (docs/03).
import { readFileSync } from "node:fs";
import { extractEventBlocks } from "../src/infrastructure/parsers/event-extractor.js";

const source = readFileSync(
  ".data/validation-fixture/agenda50/ag_conf/ag_conf.pbl.src/w_confirm_agm.srw",
  "utf-8",
);
const blocks = extractEventBlocks(source, "w_confirm_agm");

console.log(`Total de eventos/funções extraídos: ${blocks.length}`);

const owners = new Set(blocks.map((b) => b.owner));
console.log(`Donos distintos: ${owners.size}`);

const dwEvents = blocks.filter((b) => b.owner === "dw_agm18tab");
console.log(`\nEventos de dw_agm18tab (${dwEvents.length}):`);
for (const b of dwEvents) {
  console.log(`  ${b.kind} ${b.name} [linhas ${b.startLine}-${b.endLine}, ${b.body.length} chars]`);
}

const zoom = blocks.find((b) => b.owner === "dw_agm18tab" && b.name === "zoom");
if (zoom) {
  console.log(`\n--- corpo do evento zoom: ${zoom.body.length} chars (arquivo inteiro: ${source.length} chars) ---`);
  const groupCalcIdx = zoom.body.indexOf("GroupCalc");
  console.log(zoom.body.slice(Math.max(0, groupCalcIdx - 150), groupCalcIdx + 350));
} else {
  console.log("\nERRO: evento zoom não encontrado!");
}
