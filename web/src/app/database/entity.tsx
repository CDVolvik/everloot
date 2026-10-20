import type { ReactNode } from "react";
import { AgreementMeter, Card, SectionHeading } from "@/components/ui";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";

// The layout every database entity page shares (item, NPC, quest, object, vendor): a left rail with the
// tooltip frame and the facts, and the relation tabs on the right. Stacked on a phone.

export function EntityLayout({ rail, children }: { rail: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside aria-label="Facts" className="min-w-0 space-y-6">{rail}</aside>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}

/** One fact: a value when there is one; without it the row shows the empty agreement meter. */
export interface Fact { label: string; value?: ReactNode }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** A titled list of facts in a card. `unconfirmed` dashes the edge: the values are from the game files. */
export function FactsCard({ title, facts, unconfirmed = false }: { title: string; facts: Fact[]; unconfirmed?: boolean }) {
  const id = `facts-${slug(title)}`;
  return (
    <Card as="section" unconfirmed={unconfirmed} aria-labelledby={id}>
      <SectionHeading as="h2" id={id}>{title}</SectionHeading>
      <dl className="divide-y divide-line text-sm">
        {facts.map((f) => (
          <div key={f.label} className="flex min-h-10 items-center justify-between gap-4 py-2">
            <dt className="shrink-0 text-muted">{f.label}</dt>
            <dd className="min-w-0 text-right text-fg [overflow-wrap:anywhere]">{f.value ?? <AgreementMeter count={0} />}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** What a player-data table says when storage cannot be read: unrecorded, never zero. */
export function Unreachable() {
  return <p className="px-4 py-8 text-fg-2 sm:px-6">{STORAGE_UNREACHABLE}</p>;
}

/** An observed frequency as a percentage with one decimal. */
export const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

/** The shared link style for a name in a table. */
export const LINK = "text-accent hover:underline underline-offset-4";
