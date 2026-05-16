import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";
import { getTool } from "@/data/tools";

const tool = getTool("completionist")!;

export const metadata: Metadata = {
  title: tool.title,
  description: tool.description,
  keywords: tool.keywords,
  alternates: { canonical: "/tools/completionist" },
};

export default function CompletionistPage() {
  return (
    <ComingSoon
      tool={tool}
      previewSections={[
        {
          title: "Your personal missing list",
          body: "Paste your armory URL and we'll surface every mount, pet, toy, title, and achievement you haven't collected yet — across the entire game's history.",
        },
        {
          title: "Obtainability filter",
          body: "Hide removed items by default. See only what you can actually still farm today, or flip a switch to include limited-time stuff you'll need to wait for.",
        },
        {
          title: "Effort tagging",
          body: "Each entry is tagged by effort: 'Next reset', 'Weekly', 'Monthly (timewalking)', 'Rare spawn camp', 'Old raid solo', 'Reputation grind'. Filter to what fits your time.",
        },
        {
          title: "Share your progress",
          body: "Generate a public page of your collection that shows what you have, not just what's missing. Great for guild bragging rights.",
        },
      ]}
    />
  );
}
