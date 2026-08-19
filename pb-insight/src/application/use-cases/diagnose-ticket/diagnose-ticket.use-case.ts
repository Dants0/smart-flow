import type { DependencyType } from "../../../domain/entities/object-dependency.js";
import type { PBObject } from "../../../domain/entities/pb-object.js";
import type { DiagnosisOutput, DiagnosticImage, ILLMClient } from "../../ports/llm-client.port.js";
import type { IObjectRepository } from "../../ports/object-repository.port.js";
import type { ISourceFileProvider } from "../../ports/source-file-provider.port.js";
import type { ObjectContext } from "../query-object-context/query-object-context.use-case.js";
import { QueryObjectContextUseCase } from "../query-object-context/query-object-context.use-case.js";

/**
 * Tipos de relação incluídos no dump de contexto por padrão. Escolha
 * deliberada, não arbitrária: no caso real do zoom da w_confirm_agm (docs/01),
 * o que fechou a lacuna do diagnóstico foram os ANCESTRAIS (w_sheet_gen,
 * u_datawindow_padrao) — não a lista completa de 80 relacionados de 1 salto.
 * `opens` (janelas de navegação, ~25 no caso real) e `function_call`
 * (utilitários genéricos como f_get_login, ~40 no caso real) infla o
 * contexto em ordens de grandeza sem adicionar sinal para bugs de
 * comportamento/UI — ficam fora do padrão, disponíveis via `relationTypes`.
 */
export const DEFAULT_DUMP_RELATION_TYPES: DependencyType[] = ["embeds", "references"];

/**
 * Aponta para um evento/função específico do objeto raiz. Quando fornecido,
 * `prepare()` envia ao LLM só o corpo desse evento em vez do objeto raiz
 * inteiro — ver docs/03: a causa raiz de um bug costuma estar contida num
 * único evento, e o objeto inteiro é ruído (dezenas de outros eventos,
 * centenas de KB) que compete por atenção do modelo sem agregar sinal.
 */
export interface EventFocus {
  owner: string;
  name: string;
}

export interface DiagnosisPreparation {
  context: ObjectContext;
  dumpedObjects: PBObject[];
  /** true quando o dump usou um evento isolado do root, não o objeto inteiro. */
  focusedOnEvent: boolean;
  objectContext: string;
}

export class DiagnoseTicketUseCase {
  constructor(
    private readonly objectRepo: IObjectRepository,
    private readonly sourceFiles: ISourceFileProvider,
    private readonly llm: ILLMClient,
  ) {}

  /**
   * Monta o contexto (sem chamar o LLM) — separado de `diagnose()` para
   * permitir inspecionar/orçar o tamanho do contexto antes de gastar tokens
   * (ver `--dry-run` no CLI).
   */
  async prepare(
    objectName: string,
    hops = 1,
    relationTypes: DependencyType[] = DEFAULT_DUMP_RELATION_TYPES,
    eventFocus?: EventFocus,
  ): Promise<DiagnosisPreparation | null> {
    const context = await new QueryObjectContextUseCase(this.objectRepo).execute(objectName, hops);
    if (!context) return null;

    const included = new Set(relationTypes);
    const supportingObjects: PBObject[] = [
      ...context.ancestors,
      ...context.related.filter((r) => r.depth === 1 && included.has(r.via.type)).map((r) => r.object),
    ];

    const parts: string[] = [];

    if (eventFocus) {
      const owner = eventFocus.owner.toLowerCase();
      const name = eventFocus.name.toLowerCase();
      const match = (context.root.structured.events ?? []).find((e) => e.owner === owner && e.name === name);
      if (!match) {
        throw new Error(`Evento "${eventFocus.name}" do controle "${eventFocus.owner}" não encontrado em ${context.root.id}.`);
      }
      parts.push(
        `--- EVENTO: ${match.owner}.${match.name} [${match.kind}] (${context.root.filePath}, linhas ${match.startLine}-${match.endLine}) ---\n${match.body}`,
      );
    } else {
      const rootSource = await this.sourceFiles.readOne(context.root.filePath);
      parts.push(
        `--- OBJETO: ${context.root.name} [${context.root.type}] (${context.root.filePath}) ---\n${rootSource}`,
      );
    }

    for (const obj of supportingObjects) {
      const source = await this.sourceFiles.readOne(obj.filePath);
      parts.push(`--- OBJETO: ${obj.name} [${obj.type}] (${obj.filePath}) ---\n${source}`);
    }

    return {
      context,
      dumpedObjects: [context.root, ...supportingObjects],
      focusedOnEvent: Boolean(eventFocus),
      objectContext: parts.join("\n\n"),
    };
  }

  async diagnose(
    preparation: DiagnosisPreparation,
    ticketText: string,
    images?: DiagnosticImage[],
    techLeadComment?: string,
  ): Promise<DiagnosisOutput> {
    return this.llm.synthesizeDiagnosis({
      ticketText,
      objectContext: preparation.objectContext,
      images,
      techLeadComment,
    });
  }
}
