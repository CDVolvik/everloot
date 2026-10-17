import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { npcPage, stockLabel, vendorPage } from "../../../../../../kb/src/world-pages";
import { loadWorldFacts } from "@/lib/rollup-compute";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { pinLink } from "@/lib/world-map";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) return { robots: { index: false, follow: true } };
  const facts = await loadWorldFacts();
  const page = vendorPage(Number(params.id), facts);
  return {
    ...pageMetadata({ title: `Vendor ${params.id}`, description: "A WoW: Forever vendor page. A price is public after 3 installs agree on the item and the copper.", path: `/database/vendors/${params.id}` }),
    robots: { index: !facts.unreachable && page.offers.length > 0, follow: true },
  };
}

function formatCopper(copper: number): string {
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const coins = copper % 100;
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold}g`);
  if (silver > 0 || gold > 0) parts.push(`${silver}s`);
  parts.push(`${coins}c`);
  return parts.join(" ");
}

export default async function VendorPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const facts = await loadWorldFacts();
  const page = vendorPage(Number(params.id), facts);
  // Where players saw this vendor stand: the NPC pins that 3 installs agree on, as links to the map.
  const places = facts.unreachable ? [] : npcPage(page.vendorNpcId, facts).pins.flatMap((pin) => {
    const href = pinLink(pin.mapId, pin.x, pin.y);
    return href ? [{ href, label: `Map ${pin.mapId} at ${pin.x}, ${pin.y}` }] : [];
  });

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · vendor</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Vendor NPC {page.vendorNpcId}</h1>
        <p className="text-sm text-muted">An item is listed when 3 installs agree on that item and its copper price.</p>
      </header>

      {facts.unreachable ? (
        <p className="text-fg-2">{STORAGE_UNREACHABLE}</p>
      ) : page.offers.length === 0 ? (
        <p className="text-fg-2">Goods unrecorded. A price needs 3 installs agreeing.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel text-xs font-mono text-muted text-left">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Reporters</th>
              </tr>
            </thead>
            <tbody>
              {page.offers.map((offer) => (
                <tr key={`${offer.itemId}-${offer.priceCopper}`} className="border-t border-line bg-panel text-fg">
                  <td className="px-4 py-3">
                    <Link href={`/database/items/${offer.itemId}`} className="text-accent hover:underline underline-offset-4">Item {offer.itemId}</Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCopper(offer.priceCopper)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{stockLabel(offer)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{offer.reporters}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-sm text-muted">
        <Link href={`/database/npcs/${page.vendorNpcId}`} className="text-accent hover:underline underline-offset-4">NPC {page.vendorNpcId}</Link>
        {places.map((place) => (
          <span key={place.href}>{" · "}<Link href={place.href} className="text-accent hover:underline underline-offset-4">Show on the map ({place.label})</Link></span>
        ))}
        {" · "}
        <Link href="/database/vendors" className="text-accent hover:underline underline-offset-4">Vendor lookup</Link>
      </p>
    </article>
  );
}
