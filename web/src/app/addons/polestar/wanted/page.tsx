import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { PACK_IDEAS, POLESTAR, POLESTAR_HELP } from "@/data/polestar";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Polestar Pack Ideas for WoW Forever", description: "Guide packs nobody has built yet for Polestar, the WoW: Forever leveling addon: why each one is still open, and how Polestar itself needs help.", path: "/addons/polestar/wanted" }),
};

const link = "text-accent hover:underline underline-offset-4";

export default function WantedPage() {
  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          <Link href="/addons/polestar" className="hover:text-accent">Polestar</Link> · pack ideas
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Routes and guides worth building</h1>
        <p className="text-fg-2 max-w-2xl">
          Guide packs nobody has listed yet, each with the reason it is open. To start one, follow
          Polestar&apos;s <a className={link} href={POLESTAR.handbook}>pack handbook</a>: from a clone of Polestar (Node 24 and Lua 5.1),{" "}
          <span className="font-mono">polestar new &lt;folder&gt;</span> sets up a pack that already lints, plays and builds.
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="ideas">
        <h2 id="ideas" className="text-xl text-fg">Pack ideas</h2>
        <ul className="space-y-4">
          {PACK_IDEAS.map((idea) => (
            <li key={idea.title} className="rounded-xl border border-line bg-panel/40 p-5 space-y-2">
              <h3 className="text-lg font-semibold text-fg">{idea.title}</h3>
              <p className="text-sm text-fg-2">{idea.why}</p>
              <p className="text-xs text-muted">Source: <a className={link} href={idea.source.url}>{idea.source.label}</a></p>
              {idea.start.length > 0 && (
                <p className="text-sm text-fg-2">
                  On Everloot:{" "}
                  {idea.start.map((item, i) => (
                    <span key={item.href}>{i > 0 && " · "}<Link className={link} href={item.href}>{item.label}</Link></span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4" aria-labelledby="help">
        <h2 id="help" className="text-xl text-fg">Help Polestar itself</h2>
        <ul className="space-y-3">
          {POLESTAR_HELP.map((item) => (
            <li key={item.title}>
              <a className={link} href={item.url}>{item.title}</a>
              <p className="text-sm text-fg-2">{item.why}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-sm text-muted">
        Built a pack? <Link className={link} href="/addons/polestar/packs">List it</Link>. Ideas checked against
        Polestar&apos;s repository on {POLESTAR.checked}.
      </p>
    </article>
  );
}
