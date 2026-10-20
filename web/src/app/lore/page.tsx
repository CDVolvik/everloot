import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import LoreSearchForm from "@/components/LoreSearchForm";
import { BROWSE_HEADINGS, BROWSE_TYPES, hasTypes, UNAVAILABLE_COPY, type BrowseSlug } from "@/lib/lore";
import JsonLd from "@/components/JsonLd";
import LoreSource from "@/components/LoreSource";
import { BannerArt } from "@/components/game/PageBanner";
import { BANNER_MAP, loadingArt, loadSiteAssets } from "@/lib/game-assets";
import { Card, Container, Explainer, PageHeader, SectionHeading } from "@/components/ui";
import { trailFor } from "@/lib/breadcrumbs";
import { loreCollectionJsonLd } from "@/lib/jsonld";
import { getRelease } from "@/lib/release";
import { pageMetadata } from "@/lib/seo";

// Cached for a day: it only reads the manifest. Without a release the page calls noStore(), so an
// "unavailable" answer is rendered per request and never baked into a build or kept in the cache.
export const revalidate = 86400;

const DESCRIPTION = "Warcraft Wiki pages as of 13 November 2023, searchable and attributed under CC BY-SA 4.0. Lore and history, not collected WoW: Forever data.";
const LEAD = "Lore, history, characters and places. Not collected WoW: Forever data.";
const CREDIT = "Warcraft Wiki contributors, CC BY-SA 4.0";

export const metadata: Metadata = pageMetadata({ title: "Lore archive", description: DESCRIPTION, path: "/lore" });

const formatter = new Intl.NumberFormat("en-US");

export default async function LoreLanding() {
  const release = getRelease();
  if (!release) noStore();
  // The wiki count only: curated Forever rows are not part of the 2023 wiki.
  const pages = release ? release.manifest.counts["warcraft-wiki-2023"] ?? null : null;

  // The section's banner: a loading screen with the title on it, only when the asset URL is set and the upload has it.
  const assets = await loadSiteAssets();
  const banner = loadingArt(assets, BANNER_MAP.lore);
  return (
    <article>
      <JsonLd data={loreCollectionJsonLd({ name: "Lore archive", description: LEAD, path: "/lore", creditText: CREDIT })} />
      <PageHeader
        trail={trailFor("/lore")!}
        title="Lore archive"
        lede={<>The Warcraft Wiki as it stood on 13 November 2023{pages !== null ? <>, {formatter.format(pages)} pages</> : null}. {LEAD}</>}
        banner={banner ? { image: <BannerArt art={banner} eager /> } : undefined}
      />
      <Container width="reading">

        {release ? (
          <div className="space-y-12">
            <LoreSearchForm />
            {hasTypes() === true && (
              <nav aria-labelledby="browse">
                <SectionHeading id="browse">Browse by type</SectionHeading>
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {(Object.keys(BROWSE_TYPES) as BrowseSlug[]).map((slug) => (
                    <li key={slug}>
                      <Card href={`/lore/${slug}`} padding="none" className="flex min-h-11 items-center px-4 py-3 font-medium text-fg">
                        {BROWSE_HEADINGS[slug]}
                      </Card>
                    </li>
                  ))}
                  <li>
                    <Card href="/lore/coverage" padding="none" className="flex min-h-11 items-center px-4 py-3 text-fg-2">
                      What the archive covers
                    </Card>
                  </li>
                </ul>
              </nav>
            )}
            <p className="text-sm text-muted">
              This archive predates WoW: Forever. For collected gameplay facts see the{" "}
              <Link href="/database" className="text-accent">Forever database</Link>.
            </p>
          </div>
        ) : (
          <Card as="section" aria-labelledby="unavailable">
            <SectionHeading id="unavailable">Lore archive unavailable</SectionHeading>
            <p className="text-sm text-fg-2">{UNAVAILABLE_COPY}</p>
          </Card>
        )}

        {release && (
          <Explainer summary="Licence and attribution">
            <p>Published under CC BY-SA 4.0 with a source link on every page.</p>
            <p>{release.manifest.notice}</p>
          </Explainer>
        )}
        <LoreSource />
      </Container>
    </article>
  );
}
