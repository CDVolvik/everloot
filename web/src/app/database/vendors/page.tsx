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
        <p className="font-mono text-xs text-muted">WoW: Forever · vendors</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Vendor lookup</h1>
        <p className="text-sm text-fg-2 max-w-2xl">
          An item is listed when 3 installs agree on that item and its copper price. Two agreed prices both stay listed.
        </p>
      </header>
      <IdLookup kind="vendors" label="Vendor NPC id" />
      <p className="text-sm text-muted">
        <Link href="/database" className="text-accent hover:underline underline-offset-4">Forever Database</Link>
      </p>
    </article>
  );
}
