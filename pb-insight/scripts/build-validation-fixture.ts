// Script de validação pontual (não faz parte do produto): monta um fixture
// isolado em .data/validation-fixture/ com o mesmo contexto que o
// DiagnoseTicketUseCase enviaria para w_confirm_agm, mas substituindo o
// próprio w_confirm_agm pela versão COM O BUG (antes do fix SMART-51352),
// que já está reproduzida em teste-minimo/input/objeto.txt.
//
// Objetivo: testar se o contexto do grafo (ancestrais + DataWindows) fecha a
// lacuna que a rodada 2 do teste-minimo expôs (modelo errou a causa raiz sem
// ver w_sheet_gen / u_datawindow_padrao). Não toca em C:\controle de versão
// além de LEITURA de arquivos (nenhum comando git).
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DiagnoseTicketUseCase } from "../src/application/use-cases/diagnose-ticket/diagnose-ticket.use-case.js";
import { FsSourceFileProvider } from "../src/infrastructure/filesystem/fs-source-file-provider.js";
import { JsonObjectRepository } from "../src/infrastructure/persistence/json-object-repository.js";
import type { DiagnosisOutput, DiagnosticContext, ILLMClient } from "../src/application/ports/llm-client.port.js";
import { DEFAULT_WS_OBJECTS_ROOT } from "../src/interfaces/cli/shared.js";

class NoopLLM implements ILLMClient {
  async synthesizeDiagnosis(): Promise<DiagnosisOutput> {
    return { text: "", model: "noop", stopReason: "end_turn", usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

const repo = JsonObjectRepository.load(".data/graph.json");
const useCase = new DiagnoseTicketUseCase(repo, new FsSourceFileProvider(DEFAULT_WS_OBJECTS_ROOT), new NoopLLM());
const prep = await useCase.prepare("w_confirm_agm");
if (!prep) throw new Error("w_confirm_agm não encontrado no grafo");

const fixtureRoot = ".data/validation-fixture";
for (const obj of prep.dumpedObjects) {
  const destPath = join(fixtureRoot, obj.filePath);
  mkdirSync(dirname(destPath), { recursive: true });
  if (obj.name === "w_confirm_agm") {
    // Injeta a versão COM BUG (reproduzida no teste-minimo) em vez da real (já corrigida).
    const buggy = readFileSync(join("..", "teste-minimo", "input", "objeto.txt"), "utf-8");
    writeFileSync(destPath, buggy, "utf-8");
  } else {
    copyFileSync(join(DEFAULT_WS_OBJECTS_ROOT, obj.filePath), destPath);
  }
}

console.log(`Fixture montado em ${fixtureRoot} (${prep.dumpedObjects.length} objetos, w_confirm_agm com bug reintroduzido).`);
