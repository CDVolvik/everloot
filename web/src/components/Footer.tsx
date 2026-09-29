import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-parchment-100/10 mt-24">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-parchment-100/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="font-display text-gold-400 font-semibold">Everloot</span>{" "}
          &copy; {year}. The WoW: Forever database, built from player data.
        </div>
        <div className="flex items-center gap-4">
          <Link href="/privacy" className="hover:text-gold-400 transition">
            Privacy
          </Link>
          <Link href="/about" className="hover:text-gold-400 transition">
            About
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-8 text-[11px] text-parchment-100/40 leading-relaxed">
        Not affiliated with or endorsed by Blizzard Entertainment. World of Warcraft
        and related trademarks are property of Blizzard Entertainment, Inc.
      </div>
    </footer>
  );
}
