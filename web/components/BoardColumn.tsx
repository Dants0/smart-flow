import type { Card, Stage } from "@/lib/types";
import { STAGE_META } from "@/lib/stageMeta";
import { CardTile } from "./CardTile";

export function BoardColumn({
  stage,
  cards,
  onSelect,
}: {
  stage: Stage;
  cards: Card[];
  onSelect: (card: Card) => void;
}) {
  const meta = STAGE_META[stage];
  const Icon = meta.icon;

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-zinc-100/60 dark:bg-zinc-900/40">
      <div className="flex items-center gap-2 px-3 py-3">
        <Icon className={`size-4 ${meta.header}`} />
        <h2 className={`text-sm font-semibold ${meta.header}`}>{meta.label}</h2>
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-500 shadow-sm dark:bg-zinc-800 dark:text-zinc-400">
          {cards.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3">
        {cards.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-zinc-400">
            nenhum card
          </p>
        )}
        {cards.map((card) => (
          <CardTile key={card.id} card={card} onClick={() => onSelect(card)} />
        ))}
      </div>
    </div>
  );
}
