import Link from "next/link";
import Reveal from "@/components/Reveal";
import { tools } from "@/data/tools";

const TICKER = [
  "Drop rates",
  "Guild scores",
  "Spawn maps",
  "Profession routes",
  "Loot history",
  "Farming routes",
  "Raid progression",
  "Vendor lists",
];

export default function Home() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="relative pt-6 pb-2 text-center">
        <div className="aurora" aria-hidden="true" />
        <div className="relative">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80 mb-4">
          Free · No Login · Built From Player Data
        </p>
        <h1 className="font-display text-4xl sm:text-6xl font-bold text-parchment-100 leading-tight tracking-tight">
          Every drop. Every guild. <span className="text-gold-400">Every reset.</span>
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-lg text-parchment-100/75">
          Everloot is the WoW: Forever database — drop rates, guild progression,
          professions and farming routes, collected by players running our
          lightweight addon. Plus the tools that make it all usable.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/tools/gold-per-hour"
            className="cta-glow inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-gold-500 text-parchment-950 font-semibold hover:bg-gold-400 transition"
          >
            <span>🪙</span>
            <span>Try the Gold/Hour Calculator</span>
          </Link>
          <Link
            href="#tools"
            className="px-5 py-3 rounded-lg border border-parchment-100/20 hover:border-gold-400/60 transition text-parchment-100/90"
          >
            See all tools
          </Link>
        </div>
        </div>

        {/* Ticker */}
        <div className="relative mt-10 overflow-hidden" aria-hidden="true">
          <div className="ticker-track gap-8 text-xs uppercase tracking-[0.25em] text-parchment-100/40">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i} className="flex items-center gap-8 whitespace-nowrap">
                {t} <span className="text-gold-500/60">◆</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Tools grid */}
      <Reveal>
      <section id="tools" className="scroll-mt-20">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-parchment-100">
            The toolkit
          </h2>
          <p className="text-sm text-parchment-100/60">
            More dropping each patch.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => {
            const isLive = tool.status === "live";
            return (
              <Link
                key={tool.slug}
                href={`/tools/${tool.slug}`}
                className="tool-card group relative rounded-xl border border-parchment-100/10 bg-parchment-900 p-5 hover:border-gold-400/50 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-3xl">{tool.icon}</div>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${
                      isLive
                        ? "bg-parchment-950 text-uncommon border-uncommon/40"
                        : "bg-parchment-950 text-gold-400 border-gold-500/40"
                    }`}
                  >
                    {isLive ? "Live" : "Coming soon"}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-parchment-100 group-hover:text-gold-400 transition">
                  {tool.title}
                </h3>
                <p className="mt-1 text-sm text-parchment-100/70">
                  {tool.tagline}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
      </Reveal>

      {/* Why this site */}
      <Reveal delay={120}>
      <section className="grid md:grid-cols-3 gap-6 text-sm">
        <div className="rounded-lg border border-parchment-100/10 p-5">
          <div className="text-gold-400 text-xl mb-2">⚡</div>
          <h3 className="font-semibold text-parchment-100">Fast and focused</h3>
          <p className="mt-1 text-parchment-100/70">
            Each tool does one thing well. No 47 tabs to click through before
            you get an answer.
          </p>
        </div>
        <div className="rounded-lg border border-parchment-100/10 p-5">
          <div className="text-gold-400 text-xl mb-2">🔓</div>
          <h3 className="font-semibold text-parchment-100">No account needed</h3>
          <p className="mt-1 text-parchment-100/70">
            All tools work in your browser. Your data stays on your device unless
            you choose to share a link.
          </p>
        </div>
        <div className="rounded-lg border border-parchment-100/10 p-5">
          <div className="text-gold-400 text-xl mb-2">🛠️</div>
          <h3 className="font-semibold text-parchment-100">Built by a player</h3>
          <p className="mt-1 text-parchment-100/70">
            Every tool here started as &ldquo;I wish something did X&rdquo;
            after a raid night. If one doesn&apos;t, tell us.
          </p>
        </div>
      </section>
      </Reveal>
    </div>
  );
}
