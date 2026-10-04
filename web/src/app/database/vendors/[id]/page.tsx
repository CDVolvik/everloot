import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { stockLabel, vendorPage } from "../../../../../../kb/src/world-pages";
import { loadWorldFacts } from "@/lib/rollup-compute";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  return {
    title: `Vendor ${params.id}`,
    description: "A WoW: Forever vendor page. A price is public after 3 installs agree on the item and the copper.",
    alternates: { canonical: `/database/vendors/${params.id}` },
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

export default async function VendorPage({ params }: { params: { id: string } }) {
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const page = vendorPage(Number(params.id), await loadWorldFacts());

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">WoW: Forever · vendor</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">Vendor NPC {page.vendorNpcId}</h1>
        <p className="text-sm text-parchment-100/60">An item is listed when 3 installs agree on that item and its copper price.</p>
      </header>

      {page.offers.length === 0 ? (
        <p className="text-parchment-100/75">Goods unrecorded. A price needs 3 installs agreeing.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-parchment-100/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment-900 text-xs uppercase tracking-wider text-parchment-100/60 text-left">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Reporters</th>
              </tr>
            </thead>
            <tbody>
              {page.offers.map((offer) => (
                <tr key={`${offer.itemId}-${offer.priceCopper}`} className="border-t border-parchment-100/10 bg-parchment-900 text-parchment-100/85">
                  <td className="px-4 py-3">
                    <Link href={`/database/items/${offer.itemId}`} className="text-gold-400 hover:underline underline-offset-4">Item {offer.itemId}</Link>
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

      <p className="text-sm text-parchment-100/60">
        <Link href={`/database/npcs/${page.vendorNpcId}`} className="text-gold-400 hover:underline underline-offset-4">NPC {page.vendorNpcId}</Link>
        {" · "}
        <Link href="/database/vendors" className="text-gold-400 hover:underline underline-offset-4">Vendor lookup</Link>
      </p>
    </article>
  );
}
