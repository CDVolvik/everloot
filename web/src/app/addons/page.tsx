import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { trailFor } from "@/lib/breadcrumbs";
import { Container, Entry, EntryList, PageHeader, SectionHeading } from "@/components/ui";
import Link from "next/link";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Addons", description: "Addons for WoW Forever: Everloot's collection addon, and Polestar, a leveling-guide addon with community guide packs. Licences and sources are listed.", path: "/addons" }),
};

const link = "inline-flex items-center min-h-11 text-accent hover:underline underline-offset-4";

const ADDONS = [
  {
    href: "/upload",
    title: "Everloot",
    by: "Ours",
    text: "Records what you see in game (drops, vendors, trainers, auctions, gold) so this site can publish facts several players agree on.",
    link: "Download and upload",
  },
  {
    href: "/addons/polestar",
    title: "Polestar",
    by: "Independent, by its own authors",
    text: "Leveling guides from 1 to 60 with a waypoint arrow, built from simulated routes. Anyone can add guides as a guide pack.",
    link: "Polestar, its packs and pack ideas",
  },
];

const MORE = [
  {
    href: "/addons/popular",
    title: "What Forever players run",
    text: "Players who turn on the addon list send it with their uploads. An addon is counted once three installs report it.",
    link: "Popular addons",
  },
  {
    href: "/addons/ecosystem",
    title: "Forever addons and projects",
    text: "A community list of addons and tools made for Forever, ranked on boards for installs, activity, releases and upkeep, with a check of each addon's .toc.",
    link: "The ecosystem tracker",
  },
];

export default function AddonsPage() {
  return (
    <Container width="reading">
      <article>
        <PageHeader
          trail={trailFor("/addons")!}
          title="Addons"
          lede="The addon we build, and Polestar, which we list. Polestar is made by its own authors; Everloot is not part of it."
        />
        <EntryList label="Addons">
          {ADDONS.map((addon) => (
            <Entry key={addon.href} meta={addon.by} title={addon.title} actions={<Link href={addon.href} className={link}>{addon.link}</Link>}>
              <p>{addon.text}</p>
            </Entry>
          ))}
        </EntryList>
        <section aria-labelledby="more" className="mt-12">
          <SectionHeading id="more">Addons in Forever</SectionHeading>
          <EntryList>
            {MORE.map((item) => (
              <Entry key={item.href} as="h3" title={item.title} actions={<Link href={item.href} className={link}>{item.link}</Link>}>
                <p>{item.text}</p>
              </Entry>
            ))}
          </EntryList>
        </section>
      </article>
    </Container>
  );
}
