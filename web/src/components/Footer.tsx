import Link from "next/link";
import { CONTACT_EMAIL, DISCORD_INVITE, NON_AFFILIATION, OPERATOR, SITE_BLURB, TRADEMARK_LINE } from "@/lib/jsonld";
import { deployedSha, REPO_URL, sourceUrl } from "@/lib/source";
import { CookiePreferencesButton } from "./CookieConsent";

/** `plain` marks a same-origin file the router should not prefetch, such as a feed. */
type Item = { label: string; href: string; external?: boolean; plain?: boolean };

const COLUMNS: { title: string; items: Item[] }[] = [
  {
    title: "Browse",
    items: [
      { label: "Database", href: "/database" },
      { label: "World map", href: "/map" },
      { label: "Changes", href: "/changes" },
      { label: "Lore archive", href: "/lore" },
      { label: "Addons", href: "/addons" },
    ],
  },
  {
    title: "Data and API",
    items: [
      { label: "Get the addon", href: "/addon" },
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
];

const LEGAL: Item[] = [
  { label: "Privacy policy", href: "/privacy" },
  { label: "Terms of use", href: "/terms" },
  { label: "Your privacy choices", href: "/privacy#choices" },
  { label: "Copyright and takedown", href: "/terms#takedown" },
  { label: "Trademarks", href: "/terms#trademarks" },
  { label: "Accessibility", href: "/accessibility" },
];

const itemClass = "inline-flex min-h-8 items-center text-sm text-fg-2 hover:text-accent transition";
const legalClass = "inline-flex min-h-8 items-center text-fg-2 hover:text-accent transition";

function FooterLink({ item, className = itemClass }: { item: Item; className?: string }) {
  if (item.external) return <a href={item.href} rel="noopener" className={className}>{item.label}</a>;
  if (item.plain) return <a href={item.href} className={className}>{item.label}</a>;
  return <Link href={item.href} className={className}>{item.label}</Link>;
}

export default function Footer() {
  const year = new Date().getFullYear();
  const sha = deployedSha();
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto max-w-wide px-4 pb-8 pt-12">
        <nav aria-label="Footer">
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-[2fr_1fr_1fr_1fr]">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="inline-flex min-h-8 items-center gap-2 text-lg font-bold tracking-tight text-fg">
                <svg aria-hidden="true" viewBox="8 8 48 48" width="14" height="14" className="text-accent">
                  <path d="M32 12 52 32 32 52 12 32Z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
                </svg>
                everloot
              </Link>
              <p className="mt-2 max-w-[34ch] text-sm text-fg-2">{SITE_BLURB}</p>
            </div>
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <h2 className="mb-2 font-mono text-xs text-muted">{column.title}</h2>
                <ul className="flex flex-col">
                  {column.items.map((item) => <li key={item.href}><FooterLink item={item} /></li>)}
                  {column.title === "Data and API" && (
                    <li><a href={sourceUrl()} rel="noopener" className={itemClass}>Source</a></li>
                  )}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-6 text-sm text-muted">
            <h2 className="font-mono text-xs text-muted">Legal</h2>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {LEGAL.map((item) => <li key={item.href}><FooterLink item={item} className={legalClass} /></li>)}
              <li><CookiePreferencesButton /></li>
            </ul>
          </div>
        </nav>
        <div className="mt-4 space-y-2 text-xs leading-relaxed text-muted">
          {/* The site-wide credit: it stands in for a per-page credit line (docs/DATA_POLICY.md). */}
          <p data-site-credit>
            Game data and art &copy; Blizzard Entertainment · Everloot data CC BY-SA 4.0 · Item names from the Warcraft Wiki
            (CC BY-SA 4.0) · <Link href="/methodology#credits" className="text-fg-2 underline underline-offset-4 hover:text-accent transition">Credits</Link>
          </p>
          <p>
            &copy; {year} {OPERATOR}. Code AGPL-3.0.
            {sha && <> Build <a href={sourceUrl()} rel="noopener" className="font-mono hover:text-accent transition">{sha.slice(0, 7)}</a>.</>}
            {" "}Contact: <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-accent transition">{CONTACT_EMAIL}</a>
          </p>
          <p>{NON_AFFILIATION} {TRADEMARK_LINE}</p>
        </div>
      </div>
    </footer>
  );
}
