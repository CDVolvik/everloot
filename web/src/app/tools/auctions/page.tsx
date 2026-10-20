import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { MARKET_RULE } from "../../../../../kb/src/market";
import { uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";
import GameCredit from "@/components/game/GameCredit";
import { trailFor } from "@/lib/breadcrumbs";
import { Card, Container, Disclosure, EmptyState, PageHeader, SectionHeading, SourceLine } from "@/components/ui";
import {
  crossRealmHref, itemIdParam, loadAuctionNames, realmBoards, realmHref, realmSlug, searchByName, slugParam,
} from "@/lib/auction-house";
import { itemArt } from "./art";
import { Boards, Contribute, Facts, FindPrices, ItemLink, boardItemIds, count } from "./parts";
import TimeAgo from "./TimeAgo";

// The search form lands here and is sent on to the clean URL, so the hub reads its query on each request.
export const dynamic = "force-dynamic";

const TITLE = "WoW Forever Auction House Prices";
const DESCRIPTION = "Live WoW: Forever auction house prices by realm: market value, minimum buyout and 60-day history from player scans. A price shows once 3 reporters agree.";

export const metadata: Metadata = {
  ...pageMetadata({ title: TITLE, description: DESCRIPTION, path: "/tools/auctions" }),
};

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AuctionHousePage(
  props: {
    searchParams: Promise<{ realm?: string | string[]; q?: string | string[]; item?: string | string[] }>;
  }
) {
  const searchParams = await props.searchParams;
  const realmText = one(searchParams.realm).trim().slice(0, 60);
  // `item` is the old page's parameter; links to it land on the new pages.
  const query = (one(searchParams.q) || one(searchParams.item)).trim().slice(0, 80);
  const itemId = itemIdParam(query);
  const slug = realmText ? slugParam(realmSlug(realmText)) : null;
  if (slug) redirect(itemId ? `${realmHref({ slug })}/${itemId}` : realmHref({ slug }));
  if (itemId) redirect(crossRealmHref(itemId));

  const now = new Date();
  const market = await uploadStore.loadMarket();
  const state = market.state;
  const boards = state ? realmBoards(state, now) : [];
  const rows = boards.flatMap((b) => b.rows);
  const names = await loadAuctionNames();
  const found = query ? searchByName(boards, names, query) : [];
  const { assets, tips } = await itemArt([...boardItemIds(rows, now), ...found]);
  const items = new Set(rows.map((r) => r.value.itemId)).size;
  const updated = market.dataAsOf ? Date.parse(market.dataAsOf) : null;

  return (
    <Container>
      <PageHeader
        trail={trailFor("/tools/auctions")!}
        title="Auction House"
        lede="Live WoW: Forever auction prices from scans players run with the Everloot addon."
        meta={state && (
          <Facts items={[
            updated !== null ? <>Prices updated <TimeAgo at={updated} renderedAt={now.getTime()} /></> : "Update time unrecorded",
            // No bare zeros: with no realm yet the empty state below says why.
            ...(boards.length ? [count(boards.length, "realm"), count(items, "item")] : []),
          ]} />
        )}
      />

      <div className="space-y-10">
        <FindPrices realms={boards.map((b) => b.realm.name)} query={query} />

        {query && !itemId && (
          <section aria-labelledby="ah-results">
            <SectionHeading id="ah-results">Items named &ldquo;{query}&rdquo;</SectionHeading>
            {found.length === 0
              ? <Card><p className="text-fg-2" role="status">No item name matches yet: names are on the way, so search by item id for now.</p></Card>
              : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {found.map((id) => <li key={id}><ItemLink id={id} href={crossRealmHref(id)} tip={tips.get(id)} names={names} /></li>)}
                </ul>
              )}
          </section>
        )}

        {!state && (
          <Card><p className="text-fg-2" role="status">Market values are unavailable right now. They are unrecorded, not zero.</p></Card>
        )}

        {state && (
          <section aria-labelledby="ah-realms">
            <SectionHeading id="ah-realms">Realms</SectionHeading>
            {boards.length === 0
              ? <EmptyState message="No realm has public prices yet: a realm shows here once 3 reporters scan the same item there." />
              : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {boards.map((b) => (
                    <li key={b.realm.key}>
                      <Card href={realmHref(b.realm)} className="h-full">
                        <span className="block text-lg font-semibold text-fg">{b.realm.name}</span>
                        <span className="mt-1 block text-sm text-fg-2">{count(b.rows.length, "item")} · {count(b.reporters, "reporter")} this week</span>
                        {b.updatedAt !== null && <span className="mt-1 block text-sm text-muted">Last scan <TimeAgo at={b.updatedAt} renderedAt={now.getTime()} /></span>}
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        )}

        {boards.length > 0 && (
          <section aria-labelledby="ah-boards">
            <SectionHeading id="ah-boards" note="Every realm with public prices. A realm's own page lists all its items.">Across all realms</SectionHeading>
            <Boards rows={rows} tips={tips} names={names} now={now} showRealm />
          </section>
        )}

        <Contribute />

        <div>
          <Disclosure summary="How are market values made?">
            <p>{MARKET_RULE}</p>
          </Disclosure>
          <Disclosure summary="Why is my realm missing?">
            <p>A realm shows up once 3 reporters have scanned the same item there. Reporters are upload addresses, so several installs in one home count once. A scan carries prices and quantities only, never seller names.</p>
          </Disclosure>
        </div>
      </div>

      {assets && tips.size > 0 && <div className="mt-8"><GameCredit version={assets.version} label={assets.label} /></div>}
      <SourceLine confirmed>{state ? dataAgeLabel(market.dataAsOf) : "Data age unrecorded"}</SourceLine>
    </Container>
  );
}
