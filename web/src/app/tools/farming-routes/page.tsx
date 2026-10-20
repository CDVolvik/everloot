import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import EmailCapture from "@/components/EmailCapture";
import { trailFor } from "@/lib/breadcrumbs";
import { Card, Container, Disclosure, EmptyState, PageHeader, SectionHeading, SourceLine } from "@/components/ui";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Farming Routes", description: "Planned WoW: Forever farming routes built from uploaded sightings. Route optimization and respawn timing are not available yet.", path: "/tools/farming-routes" }),
  keywords: ["wow forever farming", "wow forever gold farm", "wow forever routes"],
};

const PLANNED = [
  {
    title: "Spawn maps, not guesses",
    body: "Planned maps will use uploaded sightings. Distinct install IDs are not verified independent players, and sightings do not establish respawn timing.",
  },
  {
    title: "Gold per hour attached",
    body: "Route-linked estimates are planned. Gold per hour for your own farm is moving into the Everloot addon.",
  },
  {
    title: "Respawn timing",
    body: "Respawn measurement and loop optimization are planned. Repeated sightings alone do not prove a respawn interval.",
  },
  {
    title: "Gatherers + hunters",
    body: "Combined gathering and mob routes are planned, once players have uploaded enough sightings to draw them.",
  },
];

export default function FarmingRoutesPage() {
  return (
    <Container>
      <PageHeader
        trail={trailFor("/tools/farming-routes")!}
        title="Forever Farming Routes"
        lede="Zone-by-zone gold and material routes, drawn from the sightings players upload."
        actions={<Link href="/tools/auctions" className="btn">Auction House</Link>}
      />

      <div className="space-y-8">
        <EmptyState message="No routes yet: farm with the Everloot addon running and your sightings become the first spawn maps." />

        <section aria-labelledby="routes-planned">
          <SectionHeading id="routes-planned">What is planned</SectionHeading>
          {PLANNED.map((s) => (
            <Disclosure key={s.title} summary={s.title}>
              <p>{s.body}</p>
            </Disclosure>
          ))}
        </section>

        <Card className="max-w-xl">
          <EmailCapture toolSlug="farming-routes" />
        </Card>
      </div>

      <SourceLine source="Player uploads, once there are enough sightings to draw a route" />
    </Container>
  );
}
