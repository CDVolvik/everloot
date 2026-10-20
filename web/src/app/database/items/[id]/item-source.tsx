import { SOURCES, type SourceSlug } from "@/lib/items";
import { LINK } from "../../entity";

/** The tab each source is stated in: a drop or an object's loot is a "Dropped by" row. */
const TAB: Record<SourceSlug, string> = { drop: "dropped-by", object: "dropped-by", vendor: "sold-by", crafted: "created-by", quest: "reward-from" };

/** The quick-facts Source value: each label links to its tab when the page has one; null when players reported no source. */
export function itemSourceValue(from: readonly SourceSlug[] | undefined, tabIds: readonly string[]) {
  if (!from?.length) return null;
  return from.map((slug, i) => {
    const label = SOURCES.find((s) => s.slug === slug)!.label;
    return (
      <span key={slug}>
        {i > 0 && ", "}
        {tabIds.includes(TAB[slug]) ? <a href={`#${TAB[slug]}`} className={LINK}>{label}</a> : label}
      </span>
    );
  });
}
