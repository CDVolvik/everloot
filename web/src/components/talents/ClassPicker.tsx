import Link from "next/link";
import Card from "@/components/ui/Card";
import GameIcon from "@/components/game/GameIcon";
import { CLASS_TEXT } from "./TalentTreeView";

export interface ClassChoice {
  slug: string;
  name: string;
  /** The game's class icon, when the page has the asset folder. */
  icon?: string | null;
  /** The class's trees, in the game's order. */
  trees?: string[];
}

/**
 * The nine classes in their icons and colours, nine across. `tiles` is the talent hub's picker: a big
 * icon, the name, and the trees under it. `strip` is the row above every class page's calculator, so
 * another class is one click away; the class being planned is marked with aria-current and a bar in
 * its colour. On a phone the strip is icons only, in one row, and the names stay for screen readers.
 */
export default function ClassPicker({ classes, current, variant }: { classes: ClassChoice[]; current?: string; variant: "tiles" | "strip" }) {
  if (variant === "tiles") {
    return (
      <nav aria-label="Classes">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-9">
          {classes.map((c) => (
            <li key={c.slug} className="min-w-0">
              <Card href={`/tools/talents/${c.slug}`} padding="none" className="flex h-full flex-col items-center gap-2 px-1 py-4 text-center">
                {c.icon && <GameIcon src={c.icon} size={48} />}
                <span className={`max-w-full truncate font-semibold ${CLASS_TEXT[c.slug]}`}>{c.name}</span>
                {c.trees && c.trees.length > 0 && (
                  <span className="hidden text-xs leading-snug text-muted lg:block">
                    {c.trees.map((t) => <span key={t} className="block">{t}</span>)}
                  </span>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  const iconsOnly = classes.every((c) => c.icon);
  return (
    <nav aria-label="Classes">
      <ul className={`grid gap-1.5 sm:gap-2 ${iconsOnly ? "grid-cols-9" : "grid-cols-3 sm:grid-cols-9"}`}>
        {classes.map((c) => {
          const on = c.slug === current;
          return (
            <li key={c.slug} className="min-w-0">
              <Link
                href={`/tools/talents/${c.slug}`}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-control border px-0.5 py-1.5 text-sm font-semibold transition-colors sm:rounded-card sm:py-2 ${CLASS_TEXT[c.slug]} ${on ? "border-current border-b-[3px] bg-panel" : "border-line bg-canvas hover:border-current"}`}
              >
                {c.icon && <GameIcon src={c.icon} size={28} />}
                <span className={`max-w-full truncate ${c.icon ? "sr-only sm:not-sr-only" : ""}`}>{c.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
