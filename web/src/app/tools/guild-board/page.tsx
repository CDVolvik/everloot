import type { Metadata } from "next";
import Link from "next/link";
import { guildFactsFromRecords, handleGuildBoard } from "../../../../../kb/src/guild-board";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";

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
        <p className="font-mono text-xs text-muted">WoW: Forever · guild</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Guild board</h1>
        <p className="text-sm text-fg-2 max-w-2xl">
          Roster, bosses, loot, and item level come from officer uploads. A figure is public when two of those uploads agree.
          A combined guild score is not available; each component is shown separately.
        </p>
      </header>

      <form method="get" className="rounded-xl border border-line bg-panel p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm text-fg-2 space-y-1">
            <span className="block text-xs font-mono text-muted">Guild</span>
            <input name="guild" defaultValue={guild} className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-fg" />
          </label>
          <label className="text-sm text-fg-2 space-y-1">
            <span className="block text-xs font-mono text-muted">Realm</span>
            <input name="realm" defaultValue={realm} className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-fg" />
          </label>
        </div>
        <button type="submit" className="btn btn-primary text-sm">Show the board</button>
      </form>

      <pre className="whitespace-pre-wrap text-sm text-fg rounded-xl border border-line bg-panel p-5">{answer}</pre>
      {!corpus.unreachable && <p className="text-xs text-muted">{dataAgeLabel(corpus.dataAsOf)}</p>}

      <p className="text-sm text-muted">
        <Link href="/guilds/olympus" className="text-accent hover:underline underline-offset-4">Olympus family record</Link>
      </p>
    </article>
  );
}
