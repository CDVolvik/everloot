import type { Metadata } from "next";
import Link from "next/link";
import { GAME_DATA_CREDIT } from "@everloot/protocol";
import IdLookup from "@/components/IdLookup";
import { Card, Container, PageHeader, SectionHeading, SourceLine } from "@/components/ui";
import { CLIENT_LAYER, CLIENT_TAXONOMY as T, itemsHref } from "@/lib/items";
import type { Crumb } from "@/lib/jsonld";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "WoW Forever items by category",
  description: `Every WoW: Forever item in build ${CLIENT_LAYER.build.version} by class and subclass, read from the game files and unconfirmed until players see it in game.`,
  path: "/database/items",
});

const TRAIL: Crumb[] = [{ name: "Home", path: "/" }, { name: "Database", path: "/database" }, { name: "Items", path: "/database/items" }];

export default function ItemsPage() {
  const classes = T.classes.filter((c) => c.items > 0);
  return (
    <Container width="wide">
      <article>
        <PageHeader
          trail={TRAIL}
          title="Items by category"
          lede={`${T.items.length.toLocaleString("en-US")} items in build ${CLIENT_LAYER.build.version}, sorted the way the game sorts them.`}
          actions={<IdLookup kind="items" label="Item id" />}
        />
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Card key={c.id} as="li">
              <SectionHeading
                action={<span className="font-mono tabular-nums text-muted">{c.items.toLocaleString("en-US")}</span>}
              >
                <Link href={itemsHref(c.slug)} className="hover:text-accent">{c.label}</Link>
              </SectionHeading>
              <ul className="space-y-1 text-sm">
                {T.subclasses.filter((s) => s.classId === c.id && s.items > 0).map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-4">
                    <Link href={itemsHref(c.slug, s.slug)} className="min-w-0 text-fg-2 hover:text-accent hover:underline underline-offset-4">{s.name ?? `Subclass ${s.id}`}</Link>
                    <span className="font-mono tabular-nums text-muted">{s.items.toLocaleString("en-US")}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </ul>
        <SourceLine build={CLIENT_LAYER.build.version}>
          Also in the MCP tool item_categories and at /api/items. {GAME_DATA_CREDIT}
        </SourceLine>
      </article>
    </Container>
  );
}
