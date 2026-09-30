import type { Metadata } from "next";
import Link from "next/link";
import IdLookup from "@/components/IdLookup";

export const metadata: Metadata = {
  title: "Vendor lookup",
  description: "Look up a WoW: Forever vendor. A price is public after 3 installs agree on the item and the copper.",
  alternates: { canonical: "/database/vendors" },
};

export default function VendorLookupPage() {
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">WoW: Forever · vendors</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">Vendor lookup</h1>
        <p className="text-sm text-parchment-100/70 max-w-2xl">
          An item is listed when 3 installs agree on that item and its copper price. Two agreed prices both stay listed.
        </p>
      </header>
      <IdLookup kind="vendors" label="Vendor NPC id" />
      <p className="text-sm text-parchment-100/60">
        <Link href="/database" className="text-gold-400 hover:underline underline-offset-4">Forever Database</Link>
      </p>
    </article>
  );
}
