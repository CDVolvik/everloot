import type { Metadata } from "next";
import Link from "next/link";
import { computeRollups } from "@/lib/rollup-compute";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";

export const metadata: Metadata = {
  title: "Forever loot observations",
  description:
    "Observed item frequency per recorded WoW: Forever loot window, with observation and install counts. Not kill-based drop probabilities.",
  alternates: { canonical: "/database/drops" },
};
export const dynamic = "force-dynamic";

export default async function DropsPage() {
  const { rates, measuredZeros, stats } = await computeRollups();
  const live = rates.filter((r) => r.public);
  const zeros = measuredZeros.filter((z) => z.public);
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">
          {stats.unreachable ? "Storage unreachable" : `${stats.lootWindows} windows · ${live.length + zeros.length} public frequencies`}
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">
          Forever loot observations
        </h1>
        <p className="text-parchment-100/75 max-w-2xl">
          Frequency means item observations divided by recorded, source-attributed loot windows.
          A loot window is not a verified kill, so this is not kill-based drop probability.
          Public frequencies require source observations from 3 install IDs; those IDs do
          not prove independent people. Actual beta-client collection remains unverified.
        </p>
      </header>

      {stats.unreachable ? (
        <p className="text-parchment-100/75">{STORAGE_UNREACHABLE}</p>
      ) : live.length + zeros.length === 0 ? (
        <div className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-8 text-center">
          <p className="text-parchment-100/80">No public frequencies yet. Source observations from 3 install IDs are required.</p>
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
                <th className="px-4 py-3 text-right">Loot windows</th>
                <th className="px-4 py-3 text-right">Item observations</th>
                <th className="px-4 py-3 text-right">Observed frequency</th>
                <th className="px-4 py-3 text-right">Install IDs</th>
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
                  <td className="px-4 py-3 text-right tabular-nums">{`${(r.rate * 100).toFixed(1)}%`}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.reporters}</td>
                </tr>
              ))}
              {zeros.map((z) => (
                <tr key={`zero-${z.sourceNpcId ?? "o"}-${z.sourceObjectId ?? "n"}`} className="border-t border-parchment-100/10 bg-parchment-900 text-parchment-100/85">
                  <td className="px-4 py-3">No items observed</td>
                  <td className="px-4 py-3">
                    {z.sourceNpcId !== undefined ? `NPC #${z.sourceNpcId}` : `Object #${z.sourceObjectId}`}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{z.kills}</td>
                  <td className="px-4 py-3 text-right tabular-nums">0</td>
                  <td className="px-4 py-3 text-right tabular-nums">0 observed</td>
                  <td className="px-4 py-3 text-right tabular-nums">{z.reporters}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
