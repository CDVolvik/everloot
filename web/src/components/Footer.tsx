import Link from "next/link";
import { CONTACT_EMAIL, DISCORD_INVITE, NON_AFFILIATION, OPERATOR, SITE_BLURB, TRADEMARK_LINE } from "@/lib/jsonld";
import { deployedSha, REPO_URL, sourceUrl } from "@/lib/source";
import Bracket from "./Bracket";
import { CookiePreferencesButton } from "./CookieConsent";

/** `plain` marks a same-origin file the router should not prefetch, such as a feed. */
type Item = { label: string; href: string; external?: boolean; plain?: boolean };

const COLUMNS: { title: string; items: Item[] }[] = [
  {
    title: "Browse",
    items: [
      { label: "Database", href: "/database" },
      { label: "Lore archive", href: "/lore" },
      { label: "World map", href: "/map" },
      { label: "Patch notes", href: "/changes" },
      { label: "Addons", href: "/addons" },
      { label: "Talent calculator", href: "/tools/talents" },
      { label: "Gold per hour", href: "/tools/gold-per-hour" },
    ],
  },
  {
    title: "Data and API",
    items: [
      { label: "Upload addon data", href: "/upload" },
      { label: "API and MCP server", href: "/connect" },
      { label: "How we count", href: "/methodology" },
      { label: "Data policy", href: `${REPO_URL}/blob/main/docs/DATA_POLICY.md`, external: true },
      { label: "Changes feed (RSS)", href: "/changes/feed.xml", plain: true },
    ],
  },
  {
    title: "Project",
    items: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Discord", href: DISCORD_INVITE, external: true },
      { label: "GitHub", href: REPO_URL, external: true },
      { label: "Contributing", href: `${REPO_URL}/blob/main/CONTRIBUTING.md`, external: true },
      { label: "Security", href: "/security" },
    ],
  },
  {
    title: "Legal",
    items: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of use", href: "/terms" },
      { label: "Your privacy choices", href: "/privacy#choices" },
      { label: "Copyright and takedown", href: "/terms#takedown" },
      { label: "Trademarks", href: "/terms#trademarks" },
      { label: "Accessibility", href: "/accessibility" },
    ],
  },
];

const itemClass = "inline-flex items-center min-h-11 text-sm text-fg-2 hover:text-accent transition";

function FooterLink({ item }: { item: Item }) {
  if (item.external) return <a href={item.href} rel="noopener" className={itemClass}>{item.label}</a>;
  if (item.plain) return <a href={item.href} className={itemClass}>{item.label}</a>;
  return <Link href={item.href} className={itemClass}>{item.label}</Link>;
}

export default function Footer() {
  const year = new Date().getFullYear();
  const sha = deployedSha();
  return (
    <footer className="border-t border-line bg-panel mt-24">
      <nav aria-label="Footer" className="mx-auto max-w-6xl px-4 py-10 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h2 className="text-xs text-muted mb-2"><Bracket>{column.title}</Bracket></h2>
            <ul className="flex flex-col">
              {column.items.map((item) => <li key={item.href}><FooterLink item={item} /></li>)}
              {column.title === "Data and API" && (
                <li><a href={sourceUrl()} rel="noopener" className={itemClass}>Source</a></li>
              )}
              {column.title === "Legal" && <li><CookiePreferencesButton /></li>}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted leading-relaxed space-y-2">
          <p>
            <span className="font-semibold text-fg">everloot</span> &copy; {year} {OPERATOR}. {SITE_BLURB} Code AGPL-3.0, data CC BY-SA 4.0.
            {sha && <> Build <a href={sourceUrl()} rel="noopener" className="font-mono hover:text-accent transition">{sha.slice(0, 7)}</a>.</>}
            {" "}Contact: <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-accent transition">{CONTACT_EMAIL}</a>
          </p>
          <p>
            {NON_AFFILIATION} {TRADEMARK_LINE}
          </p>
        </div>
      </div>
    </footer>
  );
}
