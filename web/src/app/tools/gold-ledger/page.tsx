import type { Metadata } from "next";
import Link from "next/link";
import { goldFactsFromRecords, handleGoldLedger } from "../../../../../kb/src/gold-ledger";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gold ledger",
  description: "Peak gold and the money events a character uploaded. A missing line is unrecorded.",
  alternates: { canonical: "/tools/gold-ledger" },
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
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">WoW: Forever · gold</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">Gold ledger</h1>
        <p className="text-sm text-parchment-100/70 max-w-2xl">
          Peak gold and the money events that character uploaded. Loot is the line this addon records
          today. Quest rewards, vendor sales, auction sales, spending, and gameplay stay unrecorded
          until an event is seen. The difference is unrecorded. This is the same answer as the gold_ledger tool.
        </p>
      </header>

      <form method="get" className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm text-parchment-100/80 space-y-1">
            <span className="block text-xs uppercase tracking-wider text-parchment-100/50">Character</span>
            <input name="character" defaultValue={character} className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100" />
          </label>
          <label className="text-sm text-parchment-100/80 space-y-1">
            <span className="block text-xs uppercase tracking-wider text-parchment-100/50">Realm</span>
            <input name="realm" defaultValue={realm} className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100" />
          </label>
        </div>
        <button type="submit" className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-parchment-950">Show the ledger</button>
      </form>

      <pre className="whitespace-pre-wrap text-sm text-parchment-100/85 rounded-xl border border-parchment-100/10 bg-parchment-900 p-5">{answer}</pre>
      {!corpus.unreachable && <p className="text-xs text-parchment-100/60">{dataAgeLabel(corpus.dataAsOf)}</p>}

      <p className="text-sm text-parchment-100/60">
        <Link href="/tools/gold-per-hour" className="text-gold-400 hover:underline underline-offset-4">Gold per hour</Link>
        {" · "}
        <Link href="/tools/auctions" className="text-gold-400 hover:underline underline-offset-4">Auction history</Link>
      </p>
    </article>
  );
}
