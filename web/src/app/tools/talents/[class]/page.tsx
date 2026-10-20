import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TalentClassView, { pageTitle } from "@/components/talents/TalentClassView";
import { pageMetadata } from "@/lib/seo";
import { TALENT_CLASSES, isTalentClass, loadCatalog } from "@/lib/talents/catalogs";
import { classDescription, classFacts } from "@/lib/talents/facts";

// Static: the tree is the same for everyone. A share link keeps its build in the #fragment, which
// the browser reads after the page loads, so this page is built once and cached.
export const dynamicParams = false;

export function generateStaticParams() {
  return TALENT_CLASSES.map((slug) => ({ class: slug }));
}

type Params = { params: Promise<{ class: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { class: slug } = await params;
  if (!isTalentClass(slug)) return {};
  const catalog = await loadCatalog(slug);
  const path = `/tools/talents/${slug}`;
  return pageMetadata({
    title: pageTitle(catalog.className),
    description: classDescription(classFacts(catalog)),
    path,
    image: `${path}/opengraph-image`,
  });
}

export default async function TalentClassPage({ params }: Params) {
  const { class: slug } = await params;
  if (!isTalentClass(slug)) notFound();
  // Called, not rendered: the page stays one awaitable tree, as the SEO tests render it.
  return TalentClassView({ slug });
}
