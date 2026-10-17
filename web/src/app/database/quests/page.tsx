import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import IdLookup from "@/components/IdLookup";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Quest Lookup", description: "Look up a WoW: Forever quest by id. Title, level, giver, turn-in and rewards become public after three installs agree on them.", path: "/database/quests" }),
};

export default function QuestLookupPage() {
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · quests</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Quest lookup</h1>
        <p className="text-sm text-fg-2 max-w-2xl">
          A title, level, giver, turn-in, or reward is public when 3 installs agree. The addon does not guess a level.
        </p>
      </header>
      <IdLookup kind="quests" label="Quest id" />
      <p className="text-sm text-muted">
        <Link href="/database" className="text-accent hover:underline underline-offset-4">Forever Database</Link>
      </p>
    </article>
  );
}
