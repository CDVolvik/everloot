import type { Metadata } from "next";
import Link from "next/link";
import { POLESTAR, POLESTAR_PACKS } from "@/data/polestar";

export const metadata: Metadata = {
  title: "Polestar guide packs",
  description: "An independent list of guide packs for Polestar: who made each one, what it covers, its licence and where to get it.",
  alternates: { canonical: "/addons/polestar/packs" },
};

const link = "text-accent hover:underline underline-offset-4";

export default function PacksPage() {
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          <Link href="/addons/polestar" className="hover:text-accent">Polestar</Link> · guide packs
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Guide packs for Polestar</h1>
        <p className="text-fg-2 max-w-2xl">
          Each pack is a separate addon and appears in Polestar under &quot;Guide packs&quot;
          (<span className="font-mono">/polestar packs</span>).
        </p>
        <p className="rounded-lg border border-line bg-accent/5 p-3 text-sm text-fg-2">
          The first entry is Polestar&apos;s own guides, which ship with Polestar. Every other pack is made by its own
          author, and neither Polestar nor Everloot tests or vouches for it: a pack is an addon like any other, so install
          packs from authors you trust and report problems to the pack&apos;s author.
        </p>
      </header>

      <ul className="space-y-4">
        {POLESTAR_PACKS.map((pack) => (
          <li key={pack.id} className="rounded-xl border border-line bg-panel/40 p-5 space-y-3">
            <div>
              <h2 className="text-xl font-semibold text-fg">{pack.title}</h2>
              <p className="text-sm text-fg-2">by {pack.author} · version {pack.version}</p>
            </div>
            <ul className="list-disc pl-6 text-sm text-fg-2 space-y-1">
              {pack.coverage.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Pack id</dt><dd className="font-mono text-fg-2">{pack.id}</dd>
              <dt className="text-muted">Licence</dt><dd className="text-fg-2">{pack.license}</dd>
              {pack.folder && (<><dt className="text-muted">Folder</dt><dd className="font-mono text-fg-2">{pack.folder}</dd></>)}
              {pack.needs && (<><dt className="text-muted">Needs</dt><dd className="text-fg-2">Polestar {pack.needs} or newer</dd></>)}
              {pack.source && (<><dt className="text-muted">Source</dt><dd className="text-fg-2">{pack.source}</dd></>)}
              {pack.website && (<><dt className="text-muted">Website</dt><dd><a className={link} href={pack.website}>{pack.website.replace(/^https?:\/\//, "")}</a></dd></>)}
            </dl>
            <div className="flex flex-wrap gap-3">
              {pack.downloads.map((download) => (
                <a key={download.url} href={download.url} className="inline-flex items-center min-h-11 px-4 rounded-lg border border-line text-accent hover:bg-accent/10">
                  {download.label}
                </a>
              ))}
            </div>
            <p className="text-xs text-muted">Listed {pack.listed} · details checked {pack.checked}</p>
          </li>
        ))}
      </ul>

      <section className="space-y-2" aria-labelledby="list-yours">
        <h2 id="list-yours" className="text-xl text-fg">List your pack</h2>
        <p className="text-fg-2">
          Email <a className={link} href="mailto:hello@everloot.app?subject=Polestar%20guide%20pack">hello@everloot.app</a> with
          your <span className="font-mono">pack.json</span>, what the pack covers and a download link. Packs follow
          Polestar&apos;s <a className={link} href={POLESTAR.packFormat}>pack format</a>; the <a className={link} href={POLESTAR.handbook}>handbook</a> covers
          writing and publishing one. Looking for something to build? See <Link className={link} href="/addons/polestar/wanted">pack ideas</Link>.
        </p>
      </section>
    </article>
  );
}
