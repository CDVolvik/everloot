import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { goldFactsFromRecords, handleGoldLedger } from "../../../../../kb/src/gold-ledger";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Gold Ledger", description: "Peak gold and the money events a WoW: Forever character uploaded, from that player's own addon file. A missing line means unrecorded, not zero.", path: "/tools/gold-ledger" }),
};

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function GoldLedgerPage(
  props: {
    searchParams: Promise<{ character?: string | string[]; realm?: string | string[] }>;
  }
) {
  const searchParams = await props.searchParams;
  const character = one(searchParams.character);
  const realm = one(searchParams.realm);
  const corpus = await uploadStore.loadCorpus();
  const facts = corpus.unreachable ? { snapshots: [], events: [] } : goldFactsFromRecords(corpus.records);
  const answer = corpus.unreachable
    ? STORAGE_UNREACHABLE
    : handleGoldLedger({ character, realm }, facts.snapshots, facts.events);

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · gold</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Gold ledger</h1>
        <p className="text-sm text-fg-2 max-w-2xl">
          Peak gold and the money events that character uploaded. Addon 0.2.4 records loot, quest
          rewards, vendor sales, flight costs, auction sales taken from the mailbox (after the house cut),
          postage and auction buyouts. Bids, deposits, other mail, other spending, and gameplay stay
          unrecorded until an event is seen. The difference is unrecorded. This is the same answer as the gold_ledger tool.
        </p>
      </header>

      <form method="get" className="rounded-xl border border-line bg-panel p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm text-fg-2 space-y-1">
            <span className="block text-xs font-mono text-muted">Character</span>
            <input name="character" defaultValue={character} className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 text-fg" />
          </label>
          <label className="text-sm text-fg-2 space-y-1">
            <span className="block text-xs font-mono text-muted">Realm</span>
            <input name="realm" defaultValue={realm} className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 text-fg" />
          </label>
        </div>
        <button type="submit" className="btn btn-primary text-sm">Show the ledger</button>
      </form>

      <pre className="whitespace-pre-wrap text-sm text-fg rounded-xl border border-line bg-panel p-5">{answer}</pre>
      {!corpus.unreachable && <p className="text-xs text-muted">{dataAgeLabel(corpus.dataAsOf)}</p>}

      <p className="text-sm text-muted">
        <Link href="/tools/gold-per-hour" className="text-accent hover:underline underline-offset-4">Gold per hour</Link>
        {" · "}
        <Link href="/tools/auctions" className="text-accent hover:underline underline-offset-4">Auction history</Link>
      </p>
    </article>
  );
}
