import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";
import { getTool } from "@/data/tools";

const tool = getTool("guild-tracker")!;

export const metadata: Metadata = {
  title: tool.title,
  description: tool.description,
  keywords: tool.keywords,
  alternates: { canonical: "/tools/guild-tracker" },
};

export default function GuildTrackerPage() {
  return (
    <ComingSoon
      tool={tool}
      previewSections={[
        {
          title: "Progression ladders",
          body: "Raid progress per guild from lockout data their own members upload — no armory dependency, no Blizzard namespace wait.",
        },
        {
          title: "Roster + attendance",
          body: "Who's in the guild, who's showing up, and the active-raider core behind every progression number.",
        },
        {
          title: "The Everloot score",
          body: "One internal score from progression, roster strength and gear — transparent components, versioned weights, computed never gamed.",
        },
        {
          title: "Guild families",
          body: "One public record for a family of guilds. Every figure cites the page that published it and the date.",
          href: "/guilds/olympus",
          hrefLabel: "Olympus family record",
        },
      ]}
    />
  );
}
