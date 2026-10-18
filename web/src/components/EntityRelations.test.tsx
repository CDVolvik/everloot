import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { Edge } from "../../../kb/src/edges";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

import { EntityRelations } from "./EntityRelations";

const client = (fromId: number, rel: Edge["rel"], toKind: Edge["toKind"], toId: number): Edge =>
  ({ fromKind: "item", fromId, rel, toKind, toId, evidence: "client", build: "1.60.1.70450", installs: null, firstSeen: null, lastSeen: null });
const observed: Edge[] = [
  { fromKind: "item", fromId: 2862, rel: "sold_by", toKind: "npc", toId: 1250, evidence: "observed", build: null, installs: 4, firstSeen: "2026-10-01T00:00:00.000Z", lastSeen: "2026-10-09T00:00:00.000Z" },
  { fromKind: "item", fromId: 2862, rel: "dropped_by", toKind: "npc", toId: 448, evidence: "observed", build: null, installs: 3, firstSeen: null, lastSeen: null },
];
const edges = [client(2862, "created_by", "spell", 2660), client(2862, "same_icon", "icon", 135249), client(2863, "same_icon", "icon", 135249)];

test("relations are grouped, linked where a page exists, and game-file rows carry the label, the build and the notice", () => {
  const html = renderToStaticMarkup(<EntityRelations kind="item" id={2862} observed={observed} client={edges} skip={["dropped_by"]} />);
  expect(html).toContain("Sold by");
  expect(html).toContain('href="/database/vendors/1250"');
  expect(html).toContain("4 installs, last seen 2026-10-09");
  expect(html).toContain("Created by");
  expect(html).toContain("spell 2660");
  expect(html).toContain("found in game files, unconfirmed, build 1.60.1.70450");
  expect(html).toContain('href="/database/items/2863"');
  expect(html).toContain("Blizzard Entertainment");
  // The drop table above already shows drops in full.
  expect(html).not.toContain("Dropped by");
});

test("only observed relations: no game-file notice; none at all: says what is needed", () => {
  expect(renderToStaticMarkup(<EntityRelations kind="item" id={2862} observed={observed} client={[]} />)).not.toContain("Blizzard");
  expect(renderToStaticMarkup(<EntityRelations kind="item" id={1} observed={[]} client={[]} />)).toContain("No relations recorded");
});
