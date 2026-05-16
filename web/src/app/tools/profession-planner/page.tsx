import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";
import { getTool } from "@/data/tools";

const tool = getTool("profession-planner")!;

export const metadata: Metadata = {
  title: tool.title,
  description: tool.description,
  keywords: tool.keywords,
  alternates: { canonical: "/tools/profession-planner" },
};

export default function ProfessionPlannerPage() {
  return (
    <ComingSoon
      tool={tool}
      previewSections={[
        {
          title: "Optimal leveling route",
          body: "Tell us your profession and current skill. We'll pick the recipes with the best skill-up-per-material ratio for your current bracket, factoring in yellow/green thresholds.",
        },
        {
          title: "Materials shopping list",
          body: "Totals all mats you need for the full path, grouped so you can paste into an addon like TradeSkillMaster or copy-buy on the AH.",
        },
        {
          title: "Realm-aware cost",
          body: "Pulls live auction-house prices from the Blizzard API for your realm so the estimate reflects what leveling will actually cost you today.",
        },
        {
          title: "Expansion-aware",
          body: "Supports current expansion (The War Within) plus all legacy brackets so you can power through older tiers efficiently.",
        },
      ]}
    />
  );
}
