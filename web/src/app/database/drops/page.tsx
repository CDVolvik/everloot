import type { Metadata } from "next";
import Link from "next/link";
import { computeRollups } from "@/lib/rollup-compute";

export const metadata: Metadata = {
  title: "Forever drop rates",
  description:
    "Corroborated WoW: Forever drop rates with kill counts — public only after 3+ independent installs report.",
  alternates: { canonical: "/database/drops" },
};
export const dynamic = "force-dynamic";

export default async function DropsPage() {
  const { rates, stats } = await computeRollups();
  const live = rates.filter((r) => r.public);
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">
          {stats.lootWindows} windows · {live.length} public rates
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">
          Forever drop rates
        </h1>
        <p className="text-parchment-100/75 max-w-2xl">
          Every rate ships with its kill count and reporter count. One loot window counts
          as one kill; a rate goes public when kills come from 3+ independent installs.
        </p>
      </header>

      {live.length === 0 ? (
        <div className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-8 text-center">
          <p className="text-parchment-100/80">No agreed rates yet. A rate goes public when 3 installs have killed the source.</p>
          <p className="mt-1 text-sm text-parchment-100/60">
            Be the first source — run the addon and send data on the{" "}
            <Link href="/upload" className="text-gold-400 hover:underline underline-offset-4">upload page</Link>.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-parchment-100/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment-900 text-xs uppercase tracking-wider text-parchment-100/60 text-left">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Kills</th>
                <th className="px-4 py-3 text-right">Drops</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Reporters</th>
              </tr>
            </thead>
            <tbody>
              {live.map((r) => (
                <tr key={`${r.sourceNpcId ?? r.sourceObjectId}-${r.itemId}`} className="border-t border-parchment-100/10 bg-parchment-900 text-parchment-100/85">
                  <td className="px-4 py-3">
                    <Link href={`/database/items/${r.itemId}`} className="text-gold-400 hover:underline underline-offset-4">
                      Item #{r.itemId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {r.sourceNpcId !== undefined ? `NPC #${r.sourceNpcId}` : `Object #${r.sourceObjectId}`}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.kills}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.drops}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{(r.rate * 100).toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.reporters}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
