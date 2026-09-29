import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";
import { getTool } from "@/data/tools";

const tool = getTool("database")!;

export const metadata: Metadata = {
  title: tool.title,
  description: tool.description,
  keywords: tool.keywords,
  alternates: { canonical: "/tools/database" },
};

export default function DatabasePage() {
  return (
    <ComingSoon
      tool={tool}
      previewSections={[
        {
          title: "Drop rates with kill counts",
          body: "Every rate ships with its sample size. A 50% rate from 4 kills reads as 4 kills, not as a fact.",
        },
        {
          title: "Spawn maps",
          body: "NPC positions from independent player sightings — corroborated spots go public, single reports stay queued.",
        },
        {
          title: "Quests + vendors",
          body: "Givers, turn-ins, rewards and merchant lists, all sourced from in-game capture with provenance on every row.",
        },
        {
          title: "Ask anything",
          body: "The same knowledge behind the in-game /ask companion, searchable on the web with exact-title-first ranking.",
        },
      ]}
    />
  );
}
