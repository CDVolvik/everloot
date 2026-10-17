import type { Metadata } from "next";
import Link from "next/link";
import { computeRollups } from "@/lib/rollup-compute";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";

export const metadata: Metadata = {
  title: "Forever Database",
  description:
    "Loot-window observations, NPC sightings, quests and vendors for WoW: Forever. Public facts depend on corroborated install reports.",
  alternates: { canonical: "/database" },
};
export const dynamic = "force-dynamic";

const SECTIONS = [
  { title: "Loot observations", href: "/database/drops", body: "Observed frequency per source-attributed loot window. Source observations from 3 install IDs are required; these are not verified kills or drop probabilities." },
  { title: "Spawn maps", href: "/database/npcs", body: "NPC positions from corroborated sightings. Single reports stay queued, never published." },
  { title: "Quests", href: "/database/quests", body: "Givers, turn-ins, and rewards. A row is public after 3 installs agree." },
  { title: "Vendors", href: "/database/vendors", body: "Merchant lists. A price is public after 3 installs agree on the item and the copper." },
  { title: "Guilds", href: "/tools/guild-board", body: "Officer-authorized progression and roster uploads. No aggregate guild score is published." },
  { title: "Lore archive", href: "/lore", body: "Warcraft Wiki pages as of November 2023, CC BY-SA 4.0. Lore and history, not collected Forever data." },
];

export default async function DatabasePage() {
  const { rates, measuredZeros, stats } = await computeRollups();
  const live = rates.filter((r) => r.public).length + measuredZeros.filter((z) => z.public).length;
  const queued = rates.length + measuredZeros.length - live;
  const counts = [
    { label: "Uploads", value: stats.uploads },
    { label: "Loot windows", value: stats.lootWindows },
    { label: "Public frequencies", value: live },
    { label: "Queued facts", value: queued },
  ];
  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          Thottbot reborn · corroborated only
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">
          Forever Database
        </h1>
        <p className="text-lg text-fg-2 max-w-2xl">
          Items, NPCs, quests and vendors for WoW: Forever — built from data players
          collect, with public facts gated by matching install reports. Distinct install IDs
          do not establish independent players. Actual beta-client collection remains unverified.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {counts.map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-panel p-5 text-center">
            <div className="text-3xl font-bold text-accent">{stats.unreachable ? "unrecorded" : c.value}</div>
            <div className="mt-1 text-xs font-mono text-muted">{c.label}</div>
          </div>
        ))}
      </div>
      {!stats.unreachable && <p className="text-xs text-muted">{dataAgeLabel(stats.dataAsOf)}</p>}

      <div className="grid md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <Link key={s.title} href={s.href} className="rounded-xl border border-line p-5 bg-panel hover:border-accent">
            <h2 className="text-lg font-semibold text-accent">{s.title}</h2>
            <p className="mt-1 text-sm text-fg-2">{s.body}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-line bg-panel p-6">
        <h2 className="text-xl text-fg">Be the first source</h2>
        <p className="mt-1 text-sm text-fg-2 max-w-xl">
          {stats.unreachable ? (
            STORAGE_UNREACHABLE
          ) : (
            <>
              A count above is what the store returned. Zero means that store was empty. Run the addon,
              send data on the{" "}
              <Link href="/upload" className="text-accent hover:underline underline-offset-4">upload page</Link>,
              and watch your farms become the reference.
            </>
          )}
        </p>
      </div>
    </article>
  );
}
