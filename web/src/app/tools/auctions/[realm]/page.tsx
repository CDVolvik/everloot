import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { MARKET_RULE } from "../../../../../../kb/src/market";
import { uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";
import GameCredit from "@/components/game/GameCredit";
import { trailFor } from "@/lib/breadcrumbs";
import { Card, Container, Disclosure, EmptyState, PageHeader, SectionHeading, SourceLine } from "@/components/ui";
import {
  AH_PATH, agreementSoFar, findBoard, indexable, loadAuctionNames, realmBoards, realmHref, slugParam, slugWords,
} from "@/lib/auction-house";
import { itemArt } from "../art";
import { Boards, Contribute, Facts, FindPrices, boardItemIds, count } from "../parts";
import TimeAgo from "../TimeAgo";

type Props = { params: Promise<{ realm: string }> };

// Built on first visit and rebuilt at most every five minutes: the rollup itself changes every ten.
export const revalidate = 300;
export async function generateStaticParams() {
  return [];
}

const ALL_ITEMS = 200;

async function load(raw: string) {
  const slug = slugParam(raw);
  if (!slug) notFound();
  const now = new Date();
  const market = await uploadStore.loadMarket();
  const board = market.state ? findBoard(realmBoards(market.state, now), slug) : null;
  return { slug, now, market, board, name: board?.realm.name ?? slugWords(slug) };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug, board, name } = await load((await props.params).realm);
  const items = board ? count(board.rows.length, "item") : "the items";
  return {
    ...pageMetadata({
      title: `WoW Forever ${name} Auction House Prices`,
      description: `Auction house prices on ${name} in WoW: Forever: market value, minimum buyout and the biggest price moves for ${items}, from scans players upload.`,
      path: realmHref({ slug }),
    }),
    robots: { index: Boolean(board?.rows.some((r) => indexable(r.value))), follow: true },
  };
}

export default async function RealmPage(props: Props) {
  const raw = (await props.params).realm;
  const { slug, now, market, board, name } = await load(raw);
  if (decodeURIComponent(raw) !== slug) permanentRedirect(realmHref({ slug }));
  const state = market.state;
  const names = await loadAuctionNames();
  const { assets, tips } = await itemArt(board ? boardItemIds(board.rows, now, ALL_ITEMS) : []);
  const trail = [...trailFor(AH_PATH)!, { name, path: realmHref({ slug }) }];

  return (
    <Container>
      <PageHeader
        trail={trail}
        title={name}
        lede={`Auction House prices on ${name}, from scans players run with the Everloot addon.`}
        meta={board && (
          <Facts items={[
            board.updatedAt !== null ? <>Last scan <TimeAgo at={board.updatedAt} renderedAt={now.getTime()} /></> : "No scan this week",
            count(board.rows.length, "item"),
            `${count(board.reporters, "reporter")} this week`,
          ]} />
        )}
      />

      <div className="space-y-10">
        <FindPrices realms={board ? [board.realm.name] : []} realm={board?.realm.name ?? ""} />

        {!state && (
          <Card><p className="text-fg-2" role="status">Market values are unavailable right now. They are unrecorded, not zero.</p></Card>
        )}

        {state && !board && (
          <EmptyState
            count={agreementSoFar(state, slug)}
            message={`No public prices on ${name} yet: a price shows once 3 reporters scan the same item here.`}
          />
        )}

        {board && (
          <section aria-labelledby="ah-realm-boards">
            <SectionHeading id="ah-realm-boards">Market</SectionHeading>
            <Boards rows={board.rows} tips={tips} names={names} now={now} showRealm={false} listedLimit={ALL_ITEMS} />
          </section>
        )}

        <Contribute />

        <Disclosure summary="How are market values made?">
          <p>{MARKET_RULE}</p>
        </Disclosure>
      </div>

      {assets && tips.size > 0 && <div className="mt-8"><GameCredit version={assets.version} label={assets.label} /></div>}
      <SourceLine confirmed>{state ? dataAgeLabel(market.dataAsOf) : "Data age unrecorded"}</SourceLine>
    </Container>
  );
}
