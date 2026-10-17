import Link from "next/link";
import type { Metadata } from "next";
import { tools, toolHref } from "@/data/tools";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://everloot.app";
  return (
    <div className="space-y-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Everloot",
        url: siteUrl,
        description: "WoW: Forever addon observations and player tools. Public facts depend on available corroborated reports.",
      }).replace(/</g, "\\u003c") }} />
      {/* Hero */}
      <section className="relative pt-6 pb-2 text-center overflow-hidden">
        <div className="relative">
        <p className="font-mono text-xs text-muted mb-4">
          Free tools · Addon uploads · Collecting data
        </p>
        <h1 className="text-4xl sm:text-6xl font-bold text-fg leading-tight tracking-tight">
          Every drop. Every guild. <span className="text-accent">Every reset.</span>
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-lg text-fg-2">
          Browse WoW: Forever observations, upload your addon records, or calculate
          a farm&apos;s gold per hour. Database facts appear when enough install reports
          agree. Loot-window observations do not establish kill-based drop probabilities.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/database"
            className="btn btn-primary"
          >
            Browse the database
          </Link>
          <Link
            href="/upload"
            className="btn"
          >
            Upload addon data
          </Link>
          <Link href="/tools/gold-per-hour" className="inline-flex min-h-11 items-center px-3 text-accent hover:underline">Gold/Hour Calculator</Link>
        </div>
        </div>
      </section>

      {/* Tools grid */}
      <section id="tools" className="scroll-mt-20">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <h2 className="text-2xl sm:text-3xl font-semibold text-fg">
            The toolkit
          </h2>
          <p className="text-sm text-muted">
            Available, collecting data, and planned.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => {
            const isLive = tool.status === "live";
            return (
              <Link
                key={tool.slug}
                href={toolHref(tool)}
                className="tool-card group relative rounded-xl border border-line bg-panel p-5 hover:border-accent"
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={`text-[10px] font-mono px-2 py-1 rounded-full border ${
                      isLive
                        ? "bg-canvas text-q-uncommon border-q-uncommon/40"
                        : "bg-canvas text-muted border-line"
                    }`}
                  >
                    {isLive ? "Available" : tool.status === "collecting" ? "Collecting data" : "Planned"}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-fg group-hover:text-accent transition">
                  {tool.title}
                </h3>
                <p className="mt-1 text-sm text-fg-2">
                  {tool.tagline}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Why this site */}
      <section className="grid md:grid-cols-3 gap-6 text-sm">
        <div className="rounded-lg border border-line p-5">
          <h3 className="font-semibold text-fg">Fast and focused</h3>
          <p className="mt-1 text-fg-2">
            Each tool does one thing well. No 47 tabs to click through before
            you get an answer.
          </p>
        </div>
        <div className="rounded-lg border border-line p-5">
          <h3 className="font-semibold text-fg">No account needed</h3>
          <p className="mt-1 text-fg-2">
            The calculator runs on your device. Addon files go to the server only
            when you upload them, with explicit choices for named sharing.
          </p>
        </div>
        <div className="rounded-lg border border-line p-5">
          <h3 className="font-semibold text-fg">Built by a player</h3>
          <p className="mt-1 text-fg-2">
            Every tool here started as &ldquo;I wish something did X&rdquo;
            after a raid night. If one doesn&apos;t, tell us.
          </p>
        </div>
      </section>
    </div>
  );
}
