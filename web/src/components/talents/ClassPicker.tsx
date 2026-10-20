import Link from "next/link";
import Card from "@/components/ui/Card";
import GameIcon from "@/components/game/GameIcon";
import { CLASS_TEXT } from "./TalentTreeView";

export interface ClassChoice {
  slug: string;
  name: string;
  /** The game's class icon, when the page has the asset folder. */
  icon?: string | null;
  /** The class's trees, in the game's order: "Arms · Fury · Protection". */
  trees?: string[];
}

/**
 * The nine classes in their icons and colours. `cards` is the talent hub's picker, one card per class
 * with its trees; `strip` is the row above every class page's calculator, so another class is one
 * click away. The class being planned is marked with aria-current and a bar in its colour.
 */
export default function ClassPicker({ classes, current, variant }: { classes: ClassChoice[]; current?: string; variant: "cards" | "strip" }) {
  if (variant === "cards") {
    return (
      <nav aria-label="Classes">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <li key={c.slug}>
              <Card href={`/tools/talents/${c.slug}`}>
                <span className="flex items-center gap-4">
                  {c.icon && <GameIcon src={c.icon} size={48} />}
                  <span className="min-w-0">
                    <span className={`block text-lg font-semibold ${CLASS_TEXT[c.slug]}`}>{c.name}</span>
                    {c.trees && c.trees.length > 0 && <span className="block text-sm text-muted">{c.trees.join(" · ")}</span>}
                  </span>
                </span>
              </Card>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <nav aria-label="Classes">
      <ul className="grid grid-cols-3 gap-2 md:grid-cols-9">
        {classes.map((c) => {
          const on = c.slug === current;
          return (
            <li key={c.slug} className="min-w-0">
              <Link
                href={`/tools/talents/${c.slug}`}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-11 flex-col items-center justify-center gap-1.5 rounded-card border bg-panel px-1 py-2 text-sm font-semibold transition-colors ${CLASS_TEXT[c.slug]} ${on ? "border-current border-b-[3px]" : "border-line hover:border-current"}`}
              >
                {c.icon && <GameIcon src={c.icon} size={32} />}
                <span className="max-w-full truncate">{c.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
