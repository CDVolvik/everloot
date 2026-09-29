import Link from "next/link";
import { tools } from "@/data/tools";

export default function Home() {
  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="pt-6 pb-2 text-center">
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
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-gold-500 text-parchment-950 font-semibold hover:bg-gold-400 transition"
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
      </section>

      {/* Tools grid */}
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
                className="group relative rounded-xl border border-parchment-100/10 bg-parchment-900/40 p-5 hover:border-gold-400/50 hover:bg-parchment-900/60 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-3xl">{tool.icon}</div>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${
                      isLive
                        ? "bg-uncommon/15 text-uncommon"
                        : "bg-gold-500/15 text-gold-400"
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

      {/* Why this site */}
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
    </div>
  );
}
