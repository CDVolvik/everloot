import Link from "next/link";
import { sourceUrl } from "@/lib/source";
import { CookiePreferencesButton } from "./CookieConsent";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line mt-24">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <span className="font-semibold text-fg">everloot</span>{" "}
          &copy; {year}. The WoW: Forever database, built from player data.
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/database" className="inline-flex items-center min-h-11 hover:text-accent transition">Database</Link>
          <Link href="/upload" className="inline-flex items-center min-h-11 hover:text-accent transition">Upload</Link>
          <Link href="/addons" className="inline-flex items-center min-h-11 hover:text-accent transition">Addons</Link>
          <Link href="/connect" className="inline-flex items-center min-h-11 hover:text-accent transition">Connect</Link>
          <Link href="/privacy" className="hover:text-accent transition">
            Privacy
          </Link>
          <CookiePreferencesButton />
          <Link href="/about" className="hover:text-accent transition">
            About
          </Link>
          <Link href="/contact" className="hover:text-accent transition">
            Contact
          </Link>
          <a href={sourceUrl()} rel="noopener" className="hover:text-accent transition">
            Source
          </a>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-8 text-[11px] text-muted leading-relaxed">
        Not affiliated with or endorsed by Blizzard Entertainment. World of Warcraft
        and related trademarks are property of Blizzard Entertainment, Inc.
        <br />
        Code AGPL-3.0, data CC BY-SA 4.0.
      </div>
    </footer>
  );
}
