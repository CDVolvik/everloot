import { CARD_SIZE, renderCard } from "@/lib/og-card";
import { TALENT_CLASSES, isTalentClass, loadCatalog } from "@/lib/talents/catalogs";

export const alt = "WoW Forever talent calculator on Everloot";
export const size = CARD_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return TALENT_CLASSES.map((slug) => ({ class: slug }));
}

export default async function Image({ params }: { params: Promise<{ class: string }> }) {
  const { class: slug } = await params;
  const name = isTalentClass(slug) ? (await loadCatalog(slug)).className : "Class";
  return renderCard({ label: "Everloot", title: `WoW Forever ${name} Talent Calculator`, subtitle: "Plan a build and share it with its game build attached" });
}
