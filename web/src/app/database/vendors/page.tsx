import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import IdLookup from "@/components/IdLookup";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Vendor Lookup", description: "Look up a WoW: Forever vendor by id. A price is shown only after three installs agree on the item and the price in copper.", path: "/database/vendors" }),
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
