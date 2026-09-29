import Link from "next/link";
import { tools } from "@/data/tools";

export default function Header() {
  return (
    <header className="border-b border-parchment-100/10 bg-parchment-950/80 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="font-display text-xl font-bold text-gold-400 hover:text-gold-300 transition"
        >
          Everloot<span className="text-parchment-100">.app</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          {tools.map((t) => (
            <Link
              key={t.slug}
              href={`/tools/${t.slug}`}
              className="text-parchment-100/80 hover:text-gold-400 transition relative"
            >
              {t.shortTitle}
              {t.status === "coming-soon" && (
                <span className="ml-1 text-[10px] uppercase tracking-wider text-gold-500/80">
                  soon
                </span>
              )}
            </Link>
          ))}
          <Link
            href="/about"
            className="text-parchment-100/80 hover:text-gold-400 transition"
          >
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}
