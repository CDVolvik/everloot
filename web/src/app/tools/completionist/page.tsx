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
          title: "Owned versus missing",
          body: "The list is items 3 installs agree belong to a collection and a source. Owned is what one install uploaded. Missing is the rest of that list.",
          href: "/tools/collections",
          hrefLabel: "Open the collection gap",
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
