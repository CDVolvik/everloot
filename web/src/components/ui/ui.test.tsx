import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import AgreementMeter, { agreementLabel, clampAgreement } from "./AgreementMeter";
import Badge from "./Badge";
import Card from "./Card";
import Container from "./Container";
import DataTable, { type Column } from "./DataTable";
import EmptyState from "./EmptyState";
import PageHeader from "./PageHeader";
import SectionHeading from "./SectionHeading";
import SourceLine from "./SourceLine";
import TooltipFrame from "./TooltipFrame";
import { qualityOf, QUALITY_TEXT } from "./quality";

const render = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

describe("Container", () => {
  test("has two widths, wide by default", () => {
    expect(render(<Container>x</Container>)).toContain("max-w-wide");
    expect(render(<Container width="reading">x</Container>)).toContain("max-w-reading");
  });
});

describe("PageHeader", () => {
  const trail = [{ name: "Home", path: "/" }, { name: "Database", path: "/database" }, { name: "Linen Cloth", path: "/database/items/2589" }];

  test("draws one h1, the lede, meta and actions", () => {
    const html = render(<PageHeader title="Linen Cloth" lede="A trade good." meta={<span>Item 2589</span>} actions={<a href="/x">Copy link</a>} />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(text(html)).toContain("Linen Cloth A trade good. Item 2589 Copy link");
  });

  test("one title size on every page", () => {
    const html = render(<PageHeader title="T" />);
    expect(html).toMatch(/<h1 class="[^"]*text-3xl[^"]*sm:text-4xl/);
  });

  test("no bracket eyebrow above the title", () => {
    const html = render(<PageHeader title="Talent calculator" trail={trail} />);
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, "");
    expect(text(visible)).not.toMatch(/[[\]]/);
    expect(text(visible)).toBe("Home / Database / Linen Cloth Talent calculator");
  });

  test("an entity page's trail is drawn and gets its BreadcrumbList", () => {
    const html = render(<PageHeader title="Linen Cloth" trail={trail} />);
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain("data-page-crumbs");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("BreadcrumbList");
  });

  test("a route the layout already knows does not get a second BreadcrumbList", () => {
    const html = render(<PageHeader title="Census" trail={[{ name: "Home", path: "/" }, { name: "Census", path: "/census" }]} />);
    expect(html).toContain("data-page-crumbs");
    expect(html).not.toContain("BreadcrumbList");
  });

  test("colours the title by quality", () => {
    expect(render(<PageHeader title="Truesilver Champion" quality="rare" />)).toMatch(/<h1 class="[^"]*text-q-rare/);
  });
});

describe("SectionHeading", () => {
  test("one style, h2 by default, h3 on request", () => {
    const h2 = render(<SectionHeading>Used in</SectionHeading>);
    const h3 = render(<SectionHeading as="h3">Used in</SectionHeading>);
    expect(h2).toMatch(/<h2 class="text-xl font-semibold tracking-tight text-fg">Used in<\/h2>/);
    expect(h3).toMatch(/<h3 class="text-xl font-semibold tracking-tight text-fg">Used in<\/h3>/);
  });
});

describe("Card", () => {
  test("one radius, panel fill, hairline edge", () => {
    const html = render(<Card>x</Card>);
    expect(html).toContain("rounded-card");
    expect(html).toContain("border-line");
    expect(html).toContain("bg-panel");
  });

  test("an unconfirmed card has the dashed edge", () => {
    expect(render(<Card unconfirmed>x</Card>)).toContain("border-dashed");
  });

  test("a link card is one link", () => {
    const html = render(<Card href="/tools/talents">Talents</Card>);
    expect(html).toMatch(/^<a href="\/tools\/talents"/);
  });
});

describe("Badge", () => {
  test("the files badge is dashed and says where the value comes from", () => {
    const html = render(<Badge tone="files" />);
    expect(html).toContain("border-dashed");
    expect(text(html)).toBe("From game files · unconfirmed");
  });

  test("a quality badge is in its quality colour", () => {
    const html = render(<Badge tone="quality" quality="epic" />);
    expect(html).toContain("text-q-epic");
    expect(text(html)).toBe("Epic");
  });
});

describe("AgreementMeter", () => {
  test.each([0, 1, 2, 3])("%i of 3 has an accessible label and that many filled diamonds", (n) => {
    const html = render(<AgreementMeter count={n} />);
    expect(html).toContain(`role="img" aria-label="${n} of 3 installs agree"`);
    expect(html.match(/bg-accent/g)?.length ?? 0).toBe(n);
  });

  test("clamps what it cannot draw", () => {
    expect(clampAgreement(-1)).toBe(0);
    expect(clampAgreement(7)).toBe(3);
    expect(clampAgreement(2.6)).toBe(2);
    expect(clampAgreement(Number.NaN)).toBe(0);
    expect(agreementLabel(9)).toBe("3 of 3 installs agree");
  });
});

describe("EmptyState", () => {
  test("the meter at 0, one sentence and Get the addon", () => {
    const html = render(<EmptyState message="Nobody has looted this in Forever yet." />);
    expect(html).toContain('aria-label="0 of 3 installs agree"');
    expect(text(html)).toBe("Nobody has looted this in Forever yet. Get the addon");
    expect(html).toContain('href="/addon"');
    expect(html).toContain("btn btn-primary");
  });

  test("takes a better action when the page has one", () => {
    const html = render(<EmptyState message="No uploads this week." action={{ href: "/upload", label: "Upload a save file" }} />);
    expect(html).toContain('href="/upload"');
    expect(html).not.toContain('href="/addon"');
  });
});

describe("SourceLine", () => {
  test("from game files, the build and the licence on one line", () => {
    const html = render(<SourceLine build="1.60.1.70450" />);
    expect(text(html)).toBe("From game files, unconfirmed · build 1.60.1.70450 · CC BY-SA 4.0");
    expect(html).toContain("border-dashed");
    expect(html).toContain("data-source-line");
  });

  test("confirmed data drops the unconfirmed key", () => {
    const html = render(<SourceLine confirmed>uploads from 3 installs</SourceLine>);
    expect(text(html)).toBe("Confirmed by players · uploads from 3 installs · CC BY-SA 4.0");
    expect(html).not.toContain("border-dashed");
  });
});

describe("TooltipFrame", () => {
  test("dark frame, name in its quality colour, foot line", () => {
    const html = render(<TooltipFrame name="Linen Cloth" quality="common" foot="Build 1.60.1.70450 · unconfirmed"><p>Trade Goods</p></TooltipFrame>);
    expect(html).toContain("bg-tooltip");
    expect(html).toContain("border-tooltip-border");
    expect(html).toContain("text-q-common");
    expect(text(html)).toBe("Linen Cloth Trade Goods Build 1.60.1.70450 · unconfirmed");
  });
});

describe("DataTable", () => {
  type Row = { id: number; name: string; quality: number; count: number };
  const rows: Row[] = [{ id: 2589, name: "Linen Cloth", quality: 1, count: 12 }, { id: 7960, name: "Truesilver Champion", quality: 3, count: 0 }];
  const columns: Column<Row>[] = [
    { key: "name", header: "Item", cell: (r) => <span className={QUALITY_TEXT[qualityOf(r.quality)]}>{r.name}</span>, sortable: true },
    { key: "count", header: "Seen", numeric: true, cell: (r) => r.count, sortable: true },
  ];

  test("headers, rows, quality-coloured names and tabular numbers", () => {
    const html = render(<DataTable caption="Items" columns={columns} rows={rows} rowKey={(r) => String(r.id)} />);
    expect(html).toContain('<caption class="sr-only">Items</caption>');
    expect(html.match(/<th scope="col"/g)).toHaveLength(2);
    expect(html).toContain('class="text-q-rare">Truesilver Champion');
    expect(html).toMatch(/<td class="[^"]*text-right font-mono tabular-nums[^"]*">12<\/td>/);
  });

  test("a wide table scrolls inside its frame, and the frame can be scrolled from the keyboard", () => {
    const html = render(<DataTable caption="Items" columns={columns} rows={rows} rowKey={(r) => String(r.id)} />);
    expect(html).toMatch(/role="region" aria-label="Items" tabindex="0" class="[^"]*overflow-x-auto/);
    expect(html).toMatch(/^<div data-table="true" class="[^"]*min-w-0 overflow-hidden/);
  });

  test("sorting is ready: aria-sort on the sorted column, headers link to the other direction", () => {
    const html = render(
      <DataTable caption="Items" columns={columns} rows={rows} rowKey={(r) => String(r.id)} sort={{ key: "count", direction: "desc" }} sortHref={(key, dir) => `?sort=${key}&dir=${dir}`} />,
    );
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain('href="?sort=count&amp;dir=asc"');
    expect(html).toContain('href="?sort=name&amp;dir=desc"');
  });

  test("with no rows it keeps the headers and shows the empty state", () => {
    const html = render(
      <DataTable caption="Drops" columns={columns} rows={[]} rowKey={(r) => String(r.id)} empty={<EmptyState framed={false} message="Nobody has looted this yet." />} />,
    );
    expect(html.match(/<th /g)).toHaveLength(2);
    expect(html).toContain('colSpan="2"');
    expect(html).toContain("data-empty-state");
  });
});

// The components hold to the system: the spacing scale, one card radius, no default palette.
describe("the ui folder keeps to the tokens", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));
  const sources = files.map((f) => ({ f, s: readFileSync(join(dir, f), "utf8") }));

  test("the scan sees the components", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  test("spacing stays on the scale (4 8 12 16 24 32 48 72 px)", () => {
    // Half steps are allowed for optical nudges inside a control (0.5, 1.5, 2.5, 3.5).
    const off = /(?:^|[\s"'`:])-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-y|space-x)-(5|7|9|10|11|14|16|20|24)(?=[\s"'`]|$)/;
    for (const { f, s } of sources) expect(s.split(/\r?\n/).filter((line) => off.test(line)), f).toEqual([]);
  });

  test("cards and frames use the card radius, never rounded-lg, -xl or -2xl", () => {
    for (const { f, s } of sources) expect(s, f).not.toMatch(/rounded-(?:lg|xl|2xl|md)\b/);
  });
});
