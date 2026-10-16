import type { Metadata } from "next";
import Link from "next/link";
import { POLESTAR, POLESTAR_PACKS } from "@/data/polestar";

export const metadata: Metadata = {
  title: "Polestar guide packs",
  description: "An independent list of guide packs for Polestar: who made each one, what it covers, its licence and where to get it.",
  alternates: { canonical: "/addons/polestar/packs" },
};

const link = "text-gold-400 hover:underline underline-offset-4";

export default function PacksPage() {
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">
          <Link href="/addons/polestar" className="hover:text-gold-400">Polestar</Link> · guide packs
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">Guide packs for Polestar</h1>
        <p className="text-parchment-100/80 max-w-2xl">
          Each pack is a separate addon made by its own author and appears in Polestar under &quot;Guide packs&quot;
          (<span className="font-mono">/polestar packs</span>).
        </p>
        <p className="rounded-lg border border-gold-400/30 bg-gold-400/5 p-3 text-sm text-parchment-100/80">
          This list is independent: neither Polestar nor Everloot tests or vouches for the packs on it. A pack is an
          addon like any other, so install packs from authors you trust and report problems to the pack&apos;s author.
        </p>
      </header>

      <ul className="space-y-4">
        {POLESTAR_PACKS.map((pack) => (
          <li key={pack.id} className="rounded-xl border border-parchment-100/15 bg-parchment-900/40 p-5 space-y-3">
            <div>
              <h2 className="font-display text-xl font-semibold text-parchment-100">{pack.title}</h2>
              <p className="text-sm text-parchment-100/70">by {pack.author} · version {pack.version}</p>
            </div>
            <ul className="list-disc pl-6 text-sm text-parchment-100/80 space-y-1">
              {pack.coverage.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-parchment-100/60">Pack id</dt><dd className="font-mono text-parchment-100/80">{pack.id}</dd>
              <dt className="text-parchment-100/60">Licence</dt><dd className="text-parchment-100/80">{pack.license}</dd>
              {pack.folder && (<><dt className="text-parchment-100/60">Folder</dt><dd className="font-mono text-parchment-100/80">{pack.folder}</dd></>)}
              {pack.needs && (<><dt className="text-parchment-100/60">Needs</dt><dd className="text-parchment-100/80">Polestar {pack.needs} or newer</dd></>)}
              {pack.source && (<><dt className="text-parchment-100/60">Source</dt><dd className="text-parchment-100/80">{pack.source}</dd></>)}
              {pack.website && (<><dt className="text-parchment-100/60">Website</dt><dd><a className={link} href={pack.website}>{pack.website.replace(/^https?:\/\//, "")}</a></dd></>)}
            </dl>
            <div className="flex flex-wrap gap-3">
              {pack.downloads.map((download) => (
                <a key={download.url} href={download.url} className="inline-flex items-center min-h-11 px-4 rounded-lg border border-gold-400/50 text-gold-400 hover:bg-gold-400/10">
                  {download.label}
                </a>
              ))}
            </div>
            <p className="text-xs text-parchment-100/50">Listed {pack.listed} · details checked {pack.checked}</p>
          </li>
        ))}
      </ul>

      <section className="space-y-2" aria-labelledby="list-yours">
        <h2 id="list-yours" className="font-display text-xl text-parchment-100">List your pack</h2>
        <p className="text-parchment-100/80">
          Email <a className={link} href="mailto:hello@everloot.app?subject=Polestar%20guide%20pack">hello@everloot.app</a> with
          your <span className="font-mono">pack.json</span>, what the pack covers and a download link. Packs follow
          Polestar&apos;s <a className={link} href={POLESTAR.packFormat}>pack format</a>; the <a className={link} href={POLESTAR.handbook}>handbook</a> covers
          writing and publishing one. Looking for something to build? See <Link className={link} href="/addons/polestar/wanted">pack ideas</Link>.
        </p>
      </section>
    </article>
  );
}
