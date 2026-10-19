import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { computeRollups } from "@/lib/rollup-compute";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import ItemTip from "@/components/game/ItemTip";
import GameCredit from "@/components/game/GameCredit";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Loot Observations", description: "Observed item frequency per recorded WoW: Forever loot window, with observation and install counts. These are not kill-based drop probabilities.", path: "/database/drops" }),
};
export const dynamic = "force-dynamic";

export default async function DropsPage() {
  const { rates, measuredZeros, stats } = await computeRollups();
  const live = rates.filter((r) => r.public);
  const zeros = measuredZeros.filter((z) => z.public);
  // Game icons and tooltips, only when the asset URL is set and the upload has the items.
  const assets = await loadSiteAssets();
  const tips = await loadItemTips(assets, live.map((r) => r.itemId));
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          {stats.unreachable ? "Storage unreachable" : `${stats.lootWindows} windows · ${live.length + zeros.length} public frequencies · ${dataAgeLabel(stats.dataAsOf)}`}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">
          Forever loot observations
        </h1>
        <p className="text-fg-2 max-w-2xl">
          Frequency means item observations divided by recorded, source-attributed loot windows.
          A loot window is not a verified kill, so this is not kill-based drop probability.
          Public frequencies require source observations from 3 install IDs; those IDs do
          not prove independent people.
        </p>
      </header>

      {stats.unreachable ? (
        <p className="text-fg-2">{STORAGE_UNREACHABLE}</p>
      ) : live.length + zeros.length === 0 ? (
        <div className="rounded-xl border border-line bg-panel p-8 text-center">
          <p className="text-fg-2">No public frequencies yet. A frequency shows here once 3 installs have recorded loot windows from the same creature or object.</p>
          <p className="mt-1 text-sm text-muted">
            Be the first source — run the addon and send data on the{" "}
            <Link href="/upload" className="text-accent hover:underline underline-offset-4">upload page</Link>.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel text-xs font-mono text-muted text-left">
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
                <tr key={`${r.sourceNpcId ?? r.sourceObjectId}-${r.itemId}`} className="border-t border-line bg-panel text-fg">
                  <td className="px-4 py-3">
                    <ItemTip tip={tips.get(r.itemId)}>
                      <Link href={`/database/items/${r.itemId}`} className="text-accent hover:underline underline-offset-4">
                        Item #{r.itemId}
                      </Link>
                    </ItemTip>
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
                <tr key={`zero-${z.sourceNpcId ?? "o"}-${z.sourceObjectId ?? "n"}`} className="border-t border-line bg-panel text-fg">
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
      {assets && tips.size > 0 && <GameCredit version={assets.version} label={assets.label} />}
    </article>
  );
}
