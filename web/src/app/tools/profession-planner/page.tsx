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
          title: "Skill per reagent",
          body: "The path picks the agreed recipe that grants the most skill for the reagents it spends. The skill window is the one the uploads reported.",
          href: "/tools/professions",
          hrefLabel: "Open the profession path",
        },
        {
          title: "Materials, then gold",
          body: "The reagent totals are exact. A gold figure appears only when 3 uploads agree on a price for every reagent. Forever has no auction API to borrow.",
        },
        {
          title: "Three installs",
          body: "One report is a claim. The step goes on the page when 3 independent installs agree on the recipe, the window, the points, and the reagents.",
        },
        {
          title: "Forever, not a retail guide",
          body: "No copied profession sheet and no retail auction price. A bracket nobody has reported is a gap.",
        },
      ]}
    />
  );
}
