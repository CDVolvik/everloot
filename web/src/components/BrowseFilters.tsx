import type { FacetKey } from "@/lib/lore";

const LABELS: Record<FacetKey, string> = {
  expansion: "Expansion", profession: "Profession", class: "Class", race: "Race", zone: "Zone", faction: "Faction",
};

/** Plain GET form: one select per facet that has values for this type; works without JavaScript. */
export default function BrowseFilters({
  action, letter, values, selected,
}: {
  action: string;
  letter: string;
  values: Record<FacetKey, string[]>;
  selected: Partial<Record<FacetKey, string>>;
}) {
  const keys = (Object.keys(LABELS) as FacetKey[]).filter((k) => values[k].length > 0);
  if (keys.length === 0) return null;
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3 text-sm">
      <input type="hidden" name="letter" value={letter} />
      {keys.map((key) => (
        <label key={key} className="flex flex-col gap-1 text-parchment-100/70">
          {LABELS[key]}
          <select name={key} defaultValue={selected[key] ?? ""} className="min-h-11 rounded-lg border border-parchment-100/20 bg-parchment-950 px-2 text-parchment-100">
            <option value="">Any</option>
            {values[key].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
      ))}
      <button type="submit" className="min-h-11 px-4 rounded-lg bg-gold-500 text-parchment-950 font-semibold hover:bg-gold-400">Apply</button>
    </form>
  );
}
