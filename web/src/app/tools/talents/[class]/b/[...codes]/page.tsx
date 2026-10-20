import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TalentClassView from "@/components/talents/TalentClassView";
import { pageMetadata } from "@/lib/seo";
import { isTalentClass, loadCatalog } from "@/lib/talents/catalogs";
import { buildTitle, readPathCodes, summarizeBuild } from "@/lib/talents/summary";

// A build link: /tools/talents/<class>/b/<first set>[/<second set>]. The codes sit in the path, not
// the #fragment, so the server can name the build in the link preview (Discord, X, messages). The page
// is the class calculator opened on that build; it then moves the address to the class page's #plan=
// form. Rendered on first visit and kept for a day; not indexed, the class page is the canonical one.
export const revalidate = 86400;

type Params = { params: Promise<{ class: string; codes: string[] }> };

async function resolve(params: Params["params"]) {
  const { class: slug, codes } = await params;
  if (!isTalentClass(slug) || codes.length > 2) return null;
  const catalog = await loadCatalog(slug);
  const read = readPathCodes(catalog, codes);
  return read ? { slug, catalog, read } : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const r = await resolve(params);
  if (!r) return {};
  const [one, two] = r.read.sets.map((s) => summarizeBuild(r.catalog, s));
  const title = `${buildTitle(r.catalog, one.spent ? one : two)} · WoW Forever talent build`;
  const description = two.spent && one.spent
    ? `A WoW: Forever ${r.catalog.className} build with two sets: ${buildTitle(r.catalog, one)} and ${buildTitle(r.catalog, two)}. Open it in the calculator.`
    : `A WoW: Forever ${r.catalog.className} talent build, ${(one.spent ? one : two).spent} points. Open it in the calculator.`;
  const path = `/tools/talents/${r.slug}/b/${(await params).codes.join("/")}`;
  const base = pageMetadata({ title, description, path, image: `/tools/talents/${r.slug}/card?a=${r.read.first ?? "-"}&b=${r.read.second ?? "-"}` });
  return { ...base, alternates: { ...base.alternates, canonical: `/tools/talents/${r.slug}` }, robots: { index: false, follow: true } };
}

export default async function TalentBuildPage({ params }: Params) {
  const r = await resolve(params);
  if (!r) notFound();
  return TalentClassView({ slug: r.slug, initialCodes: [r.read.first, r.read.second] });
}
