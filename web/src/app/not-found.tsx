import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto text-center py-16 space-y-4">
      <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">No drop here</p>
      <h1 className="font-display text-4xl font-bold text-parchment-100">Nothing looted on this page.</h1>
      <p className="text-parchment-100/70">
        The URL doesn&apos;t exist — or the data hasn&apos;t been collected yet.
      </p>
      <div className="flex items-center justify-center gap-3 pt-2">
        <Link href="/" className="px-5 py-3 rounded-lg bg-gold-500 text-parchment-950 font-semibold hover:bg-gold-400 transition">
          Home
        </Link>
        <Link href="/database" className="px-5 py-3 rounded-lg border border-parchment-100/20 hover:border-gold-400/60 transition text-parchment-100/90">
          The database
        </Link>
      </div>
    </div>
  );
}
