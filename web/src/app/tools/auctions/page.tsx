import type { Metadata } from "next";
import Link from "next/link";
import { auctionSightingsFromRecords, handleAuctionHistory } from "../../../../../kb/src/auction-history";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Auction history",
  description: "WoW: Forever auction prices from scans players uploaded. A day is public after 3 installs agree.",
  alternates: { canonical: "/tools/auctions" },
};

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AuctionsPage(
  props: {
    searchParams: Promise<{ realm?: string | string[]; item?: string | string[] }>;
  }
) {
  const searchParams = await props.searchParams;
  const realm = one(searchParams.realm);
  const itemText = one(searchParams.item);
  const itemId = /^\d+$/.test(itemText) ? Number(itemText) : 0;
  const corpus = await uploadStore.loadCorpus();
  const answer = corpus.unreachable
    ? STORAGE_UNREACHABLE
    : handleAuctionHistory({ realm, itemId }, auctionSightingsFromRecords(corpus.records));

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">WoW: Forever · auctions</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">Auction history</h1>
        <p className="text-sm text-parchment-100/70 max-w-2xl">
          A day is public when 3 installs scanned that item on that realm. The copper is the median of those scans.
          This is the same answer as the auction_history tool.
        </p>
      </header>

      <form method="get" className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm text-parchment-100/80 space-y-1">
            <span className="block text-xs uppercase tracking-wider text-parchment-100/50">Realm</span>
            <input name="realm" defaultValue={realm} className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100" />
          </label>
          <label className="text-sm text-parchment-100/80 space-y-1">
            <span className="block text-xs uppercase tracking-wider text-parchment-100/50">Item id</span>
            <input name="item" defaultValue={itemText} inputMode="numeric" className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100" />
          </label>
        </div>
        <button type="submit" className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-parchment-950">Show the history</button>
      </form>

      <pre className="whitespace-pre-wrap text-sm text-parchment-100/85 rounded-xl border border-parchment-100/10 bg-parchment-900 p-5">{answer}</pre>

      <p className="text-sm text-parchment-100/60">
        <Link href="/tools/gold-per-hour" className="text-gold-400 hover:underline underline-offset-4">Gold per hour</Link>
        {" · "}
        <Link href="/tools/gold-ledger" className="text-gold-400 hover:underline underline-offset-4">Gold ledger</Link>
      </p>
    </article>
  );
}
