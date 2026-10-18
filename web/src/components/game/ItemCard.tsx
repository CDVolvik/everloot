import type { ItemTip } from "@/lib/game-assets";
import GameIcon from "./GameIcon";

// The item's tooltip laid out on its own page, always open: icon, name in its quality colour, the
// lines the game shows, and the game file label. The same dark frame as the hover tooltip.
export default function ItemCard({ tip }: { tip: ItemTip }) {
  return (
    <section aria-label={`${tip.name}, from the game files`} className="flex max-w-md items-start gap-3" data-item-card>
      {tip.icon && <GameIcon src={tip.icon} size={48} className="rounded-md" />}
      <div className="min-w-0 flex-1 rounded-md border border-[#3d3a2e] bg-[#0a0a0f] px-3 py-2 text-sm leading-snug text-[#e8e4d0]">
        <p className="font-semibold" style={{ color: tip.color }}>{tip.name}</p>
        <p className="sr-only">{tip.quality}</p>
        {tip.lines.map((line, i) => <p key={i} className={line.startsWith('"') ? "text-[#ffd100]" : undefined}>{line}</p>)}
        {tip.partial && <p className="mt-1 text-xs text-[#9a9a9a]">[?] marks a value the game files do not give us yet.</p>}
        <p className="mt-2 font-mono text-[10px] text-[#8a8a8a]">{tip.label}</p>
      </div>
    </section>
  );
}
