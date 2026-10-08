import type { Metadata } from "next";
import Link from "next/link";
import { guildFactsFromRecords, handleGuildBoard } from "../../../../../kb/src/guild-board";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Guild board",
  description: "Officer-published WoW: Forever guild roster, progression, loot, and item level. Two uploads have to agree.",
  alternates: { canonical: "/tools/guild-board" },
};

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function GuildBoardPage(
  props: {
    searchParams: Promise<{ guild?: string | string[]; realm?: string | string[] }>;
  }
) {
  const searchParams = await props.searchParams;
  const guild = one(searchParams.guild);
  const realm = one(searchParams.realm);
  const corpus = await uploadStore.loadCorpus();
  const answer = corpus.unreachable
    ? STORAGE_UNREACHABLE
    : handleGuildBoard({ guildName: guild, realm }, guildFactsFromRecords(corpus.records));

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">WoW: Forever · guild</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">Guild board</h1>
        <p className="text-sm text-parchment-100/70 max-w-2xl">
          Roster, bosses, loot, and item level come from officer uploads. A figure is public when two of those uploads agree.
          score_v1 has no published weights, so the board does not add the components into one number.
        </p>
      </header>

      <form method="get" className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm text-parchment-100/80 space-y-1">
            <span className="block text-xs uppercase tracking-wider text-parchment-100/50">Guild</span>
            <input name="guild" defaultValue={guild} className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100" />
          </label>
          <label className="text-sm text-parchment-100/80 space-y-1">
            <span className="block text-xs uppercase tracking-wider text-parchment-100/50">Realm</span>
            <input name="realm" defaultValue={realm} className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100" />
          </label>
        </div>
        <button type="submit" className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-parchment-950">Show the board</button>
      </form>

      <pre className="whitespace-pre-wrap text-sm text-parchment-100/85 rounded-xl border border-parchment-100/10 bg-parchment-900 p-5">{answer}</pre>

      <p className="text-sm text-parchment-100/60">
        <Link href="/guilds/olympus" className="text-gold-400 hover:underline underline-offset-4">Olympus family record</Link>
      </p>
    </article>
  );
}
