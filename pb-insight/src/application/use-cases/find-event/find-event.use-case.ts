import type { PBEventBlock } from "../../../domain/entities/pb-object.js";
import type { IObjectRepository } from "../../ports/object-repository.port.js";

export interface EventMatch {
  objectId: string;
  filePath: string;
  event: PBEventBlock;
}

/**
 * Navegação direta: acha o evento/função de um objeto sem precisar abrir o
 * PowerBuilder nem procurar manualmente dentro de um .srw de centenas de KB.
 * Serve tanto o CLI de exploração (`npm run event`) quanto o direcionamento
 * de contexto do motor de diagnóstico (`DiagnoseTicketUseCase`).
 */
export class FindEventUseCase {
  constructor(private readonly objectRepo: IObjectRepository) {}

  async execute(objectName: string, eventName: string, owner?: string): Promise<EventMatch[]> {
    const objects = await this.objectRepo.findByName(objectName);
    const name = eventName.toLowerCase();
    const ownerFilter = owner?.toLowerCase();

    const matches: EventMatch[] = [];
    for (const obj of objects) {
      for (const event of obj.structured.events ?? []) {
        if (event.name !== name) continue;
        if (ownerFilter && event.owner !== ownerFilter) continue;
        matches.push({ objectId: obj.id, filePath: obj.filePath, event });
      }
    }
    return matches;
  }
}
