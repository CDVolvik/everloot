import type { ChangeEntry } from "./changes";
import { REPO_URL } from "./source";
import { absoluteUrl, SITE_NAME, SITE_URL } from "./seo";

/**
 * Every structured-data block on the site is built here from the same values the page shows, so a
 * property cannot drift from the visible text. No ratings, no `license` on Blizzard's game data, no
 * game build as `softwareVersion`, no FAQPage, Person or speakable.
 */

export type JsonLd = Record<string, unknown>;

/** The text of a script tag: a `<` inside a value must not close it. */
export const serializeJsonLd = (data: JsonLd): string => JSON.stringify(data).replace(/</g, "\\u003c");

const CONTEXT = "https://schema.org";
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

export const CONTACT_EMAIL = "hello@everloot.app";
/** The Everloot Discord server; a permanent invite. */
export const DISCORD_INVITE = "https://discord.gg/9CKsbHTRu3";
/** The footer shows both sentences, and the Organization description repeats them. */
export const SITE_BLURB = "The WoW: Forever database, built from player data.";
export const NON_AFFILIATION = "Not affiliated with or endorsed by Blizzard Entertainment.";
export const CC_BY_SA = { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" } as const;
export const LORE_SEARCH_LABEL = "Search the lore archive";

const publisher = { "@id": ORG_ID };

export function organizationJsonLd(): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    email: CONTACT_EMAIL,
    description: `${SITE_BLURB} ${NON_AFFILIATION}`,
    sameAs: [REPO_URL, DISCORD_INVITE],
  };
}

/** The search box on the home page reads the lore archive, and the action says so. */
export function websiteJsonLd(): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_BLURB,
    publisher,
    potentialAction: {
      "@type": "SearchAction",
      name: LORE_SEARCH_LABEL,
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export interface Crumb { name: string; path: string }

/** The same trail the visible breadcrumb shows. The last crumb is the page itself. */
export function breadcrumbJsonLd(trail: Crumb[]): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({ "@type": "ListItem", position: i + 1, name: crumb.name, item: absoluteUrl(crumb.path) })),
  };
}

export function webApplicationJsonLd(app: { name: string; path: string; description: string; hubPath?: string }): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "WebApplication",
    "@id": `${absoluteUrl(app.path)}#webapplication`,
    name: app.name,
    url: absoluteUrl(app.path),
    description: app.description,
    applicationCategory: "GameApplication",
    operatingSystem: "Web browser",
    publisher,
    ...(app.hubPath ? { isPartOf: { "@id": `${absoluteUrl(app.hubPath)}#webapplication` } } : {}),
  };
}

export function softwareApplicationJsonLd(app: { name: string; description: string; version: string; downloadPath: string; licenceUrl: string; path: string }): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "SoftwareApplication",
    name: app.name,
    url: absoluteUrl(app.path),
    description: app.description,
    applicationCategory: "GameApplication",
    softwareVersion: app.version,
    downloadUrl: absoluteUrl(app.downloadPath),
    license: app.licenceUrl,
    publisher,
  };
}

/** The public observation corpus. Null while nothing has been uploaded, so an empty dataset is never advertised. */
export function datasetJsonLd(data: { uploads: number; name: string; description: string; path: string; corpusPath: string; dataAsOf?: string | null }): JsonLd | null {
  if (!(data.uploads > 0)) return null;
  return {
    "@context": CONTEXT,
    "@type": "Dataset",
    name: data.name,
    description: data.description,
    url: absoluteUrl(data.path),
    license: CC_BY_SA.url,
    creator: publisher,
    isAccessibleForFree: true,
    ...(data.dataAsOf ? { dateModified: data.dataAsOf } : {}),
    distribution: [{ "@type": "DataDownload", encodingFormat: "application/json", contentUrl: absoluteUrl(data.corpusPath) }],
  };
}

/** One timeline entry as the page shows it. A build carries no date property: its time is when Everloot first saw it. */
function changeItem(entry: ChangeEntry): JsonLd {
  if (entry.type === "build") {
    return {
      "@type": "CreativeWork",
      name: entry.title,
      description: `First seen by Everloot on ${entry.at.slice(0, 10)}. Blizzard's own release time is not recorded.`,
    };
  }
  return {
    "@type": "CreativeWork",
    name: entry.title,
    datePublished: entry.at,
    ...(entry.author ? { author: entry.author } : {}),
    ...(entry.url ? { url: entry.url } : {}),
  };
}

export function changesJsonLd(page: { name: string; description: string; path: string; entries: ChangeEntry[] }): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "CollectionPage",
    name: page.name,
    description: page.description,
    url: absoluteUrl(page.path),
    isPartOf: { "@id": WEBSITE_ID },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: page.entries.length,
      itemListElement: page.entries.map((entry, i) => ({ "@type": "ListItem", position: i + 1, item: changeItem(entry) })),
    },
  };
}

export function loreCollectionJsonLd(page: { name: string; description: string; path: string; creditText: string }): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "CollectionPage",
    name: page.name,
    description: page.description,
    url: absoluteUrl(page.path),
    license: CC_BY_SA.url,
    creditText: page.creditText,
    isPartOf: { "@id": WEBSITE_ID },
  };
}

export function aboutPageJsonLd(page: { name: string; description: string; path: string }): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "AboutPage",
    name: page.name,
    description: page.description,
    url: absoluteUrl(page.path),
    about: { "@id": ORG_ID },
    isPartOf: { "@id": WEBSITE_ID },
  };
}
