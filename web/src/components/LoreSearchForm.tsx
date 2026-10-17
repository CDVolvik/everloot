/** Plain GET form to /search; works without JavaScript. */
export default function LoreSearchForm({ query = "" }: { query?: string }) {
  return (
    <form action="/search" method="get" role="search" className="flex flex-col sm:flex-row gap-2 max-w-xl">
      <label htmlFor="lore-q" className="sr-only">Search the lore archive</label>
      <input
        id="lore-q"
        name="q"
        type="search"
        defaultValue={query}
        maxLength={200}
        placeholder="Thrall, Zul'Gurub, Ashbringer…"
        className="flex-1 min-h-11 rounded-lg border border-line bg-canvas px-3 text-fg placeholder:text-muted"
      />
      <button type="submit" className="min-h-11 px-4 rounded-lg bg-gold-500 text-parchment-950 font-semibold hover:bg-gold-400">Search</button>
    </form>
  );
}
