import type { Metadata } from "next";
import Link from "next/link";
import IdLookup from "@/components/IdLookup";

export const metadata: Metadata = {
  title: "Quest lookup",
  description: "Look up a WoW: Forever quest. Title, level, giver, turn-in, and rewards are public after 3 installs agree.",
  alternates: { canonical: "/database/quests" },
};

export default function QuestLookupPage() {
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">WoW: Forever · quests</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">Quest lookup</h1>
        <p className="text-sm text-parchment-100/70 max-w-2xl">
          A title, level, giver, turn-in, or reward is public when 3 installs agree. The addon does not guess a level.
        </p>
      </header>
      <IdLookup kind="quests" label="Quest id" />
      <p className="text-sm text-parchment-100/60">
        <Link href="/database" className="text-gold-400 hover:underline underline-offset-4">Forever Database</Link>
      </p>
    </article>
  );
}
