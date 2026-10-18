import type { Metadata } from "next";
import Link from "next/link";
import { GAME_DATA_CREDIT } from "../../../../../kb/src/attribution";
import { CLIENT_LABEL } from "../../../../../kb/src/edges";
import IdLookup from "@/components/IdLookup";
import { CLIENT_LAYER, CLIENT_TAXONOMY as T, itemsHref } from "@/lib/items";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "WoW Forever items by category",
  description: `Every WoW: Forever item in build ${CLIENT_LAYER.build.version} by class and subclass, from the game files, found in game files and unconfirmed.`,
  path: "/database/items",
});

export default function ItemsPage() {
  const classes = T.classes.filter((c) => c.items > 0);
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · items</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Items by category</h1>
        <p className="text-fg-2">
          {T.items.length.toLocaleString("en-US")} items in build {CLIENT_LAYER.build.version}, by the classes and subclasses the game itself uses.
          {" "}{CLIENT_LABEL}: a record in the files does not mean the item is, or will be, in the game.
        </p>
      </header>

      <IdLookup kind="items" label="Item id" />

      <div className="grid md:grid-cols-2 gap-6">
        {classes.map((c) => (
          <section key={c.id} className="rounded-xl border border-line bg-panel p-5 space-y-2">
            <h2 className="text-lg font-semibold">
              <Link href={itemsHref(c.slug)} className="text-accent hover:underline underline-offset-4">{c.label}</Link>{" "}
              <span className="text-sm font-normal text-muted">{c.items.toLocaleString("en-US")}</span>
            </h2>
            <ul className="text-sm text-fg-2 space-y-0.5">
              {T.subclasses.filter((s) => s.classId === c.id && s.items > 0).map((s) => (
                <li key={s.id}>
                  <Link href={itemsHref(c.slug, s.slug)} className="hover:underline underline-offset-4">{s.name ?? `Subclass ${s.id}`}</Link>{" "}
                  <span className="text-muted">{s.items.toLocaleString("en-US")}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="text-xs text-muted">
        Subclass names are the game client&apos;s own English names; class names are the client&apos;s in the plural, as item databases list them; slot and quality labels are ours, for the game&apos;s numbers.
        The same categories are in the MCP tool item_categories, at /api/items and in /api/edges/client-layer. {GAME_DATA_CREDIT}
      </p>
    </article>
  );
}
