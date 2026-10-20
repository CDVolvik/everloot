import { tokens } from "@/design/tokens";
import { renderBuildCard, renderCard } from "@/lib/og-card";
import { isTalentClass, loadCatalog } from "@/lib/talents/catalogs";
import { buildTitle, readPathCodes, summarizeBuild } from "@/lib/talents/summary";

// The link preview for a build link (/tools/talents/<class>/b/...): ?a=<first set>&b=<second set>.
// The same codes give the same picture, so it is cached like a file.
export async function GET(req: Request, { params }: { params: Promise<{ class: string }> }) {
  const { class: slug } = await params;
  if (!isTalentClass(slug)) return new Response("Not found", { status: 404 });
  const catalog = await loadCatalog(slug);
  const q = new URL(req.url).searchParams;
  const read = readPathCodes(catalog, [q.get("a") ?? "-", q.get("b") ?? "-"]);
  const color = tokens.dark[`class-${slug}`];
  const image = read
    ? await (async () => {
      const sets = read.sets.map((s) => summarizeBuild(catalog, s));
      const shown = sets.map((s, i) => ({ s, heading: i === 0 ? "First set" : "Second set" })).filter((x) => x.s.spent > 0);
      const main = shown[0].s;
      return renderBuildCard({
        label: "Everloot · WoW Forever talents",
        title: buildTitle(catalog, main),
        color,
        subtitle: shown.length === 2 ? `Second set: ${buildTitle(catalog, shown[1].s)}` : `${main.spent} points · game build ${catalog.build}`,
        groups: shown.map(({ s, heading }) => ({ heading, bars: s.trees.map((t) => ({ name: t.name, value: String(t.points), fraction: s.spent ? t.points / s.spent : 0 })) })),
      });
    })()
    : await renderCard({ label: "Everloot", title: `WoW Forever ${catalog.className} Talent Calculator`, subtitle: "Plan a build and share it with its game build attached" });
  image.headers.set("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");
  return image;
}
