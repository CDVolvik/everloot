import Link from "next/link";
import { CookiePreferencesButton } from "./CookieConsent";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-parchment-100/10 mt-24">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-parchment-100/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="font-display text-gold-400 font-semibold">Everloot</span>{" "}
          &copy; {year}. The WoW: Forever database, built from player data.
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/database" className="inline-flex items-center min-h-11 hover:text-gold-400 transition">Database</Link>
          <Link href="/upload" className="inline-flex items-center min-h-11 hover:text-gold-400 transition">Upload</Link>
          <Link href="/addons" className="inline-flex items-center min-h-11 hover:text-gold-400 transition">Addons</Link>
          <Link href="/privacy" className="hover:text-gold-400 transition">
            Privacy
          </Link>
          <CookiePreferencesButton />
          <Link href="/about" className="hover:text-gold-400 transition">
            About
          </Link>
          <Link href="/contact" className="hover:text-gold-400 transition">
            Contact
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
