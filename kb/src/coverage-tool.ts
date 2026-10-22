import { MCP_CREDIT, type McpToolArgs } from "@everloot/protocol";
import { COVERAGE_TYPES, coverageShares, type CoverageCell, type CoverageReport } from "./coverage.js";

/** The host lends the same score its public coverage page reads. No raw records or baseline are read here. */
export type CoverageLoader = () => Promise<CoverageReport | null>;

const unknown = "[?]";
const page = "https://everloot.app/database/coverage";
const pct = (value: number | null) => value === null ? unknown : `${Math.floor(value * 100)}%`;

function cellText(cell: CoverageCell): string {
  const shares = coverageShares(cell);
  const denominator = cell.denominator ?? unknown;
  return `${cell.settled}/${denominator} settled; ${cell.confirmed}/${denominator} confirmed (${pct(shares.settled)} / ${pct(shares.confirmed)}); `
    + `${cell.reported}/${denominator} reported; ${cell.recheck}/${denominator} to recheck; expected ${cell.expected ?? unknown}; observed ${cell.observed}`;
}

export async function answerCoverage(args: McpToolArgs<"coverage">, loader?: CoverageLoader): Promise<string> {
  const scope = `Scope: ${args.zone === undefined ? "all released zones" : `zone ${args.zone}`}; ${args.type === undefined ? "all types" : `type ${args.type}`}. Unplaced facts and held-back zones are excluded.`;
  const unavailable = (reason: string) => `${scope}\nCoverage ${reason}; counts, denominators, data date and installs are ${unknown}, not measured zero.\nMore: ${page}\n${MCP_CREDIT}`;
  if (!loader) return unavailable("not connected");
  let report: CoverageReport | null;
  try { report = await loader(); } catch { return unavailable("unavailable"); }
  if (!report) return unavailable("unavailable");
  const zones = report.zones.filter((z) => args.zone === undefined || z.mapId === args.zone);
  const types = args.type === undefined ? COVERAGE_TYPES : [args.type];
  const lines = [scope,
    `Data as of ${report.dataAsOf ?? unknown}; build ${report.build ?? unknown}; ${report.installs} distinct folded installs overall, including unplaced facts, before zone/type filters. Each zone states its own installs across all types.`,
    `Method: ${report.method}`,
    "coverage = settled / expected; confirmed / expected beside it. Denominator = max(expected, observed), in entity-field facts. Confirmed includes settled. Reported counts are aggregate states, never unconfirmed values.",
    `Expected counts dated ${report.expected?.dataAsOf ?? unknown}, from game files and a local Classic baseline (counts only). Missing or zero denominators give [?] shares.`,
  ];
  if (!zones.length) lines.push("No released zone matches this filter; no counts measured for this scope.");
  for (const zone of zones) {
    lines.push(`\n${zone.name} (zone ${zone.mapId}); ${zone.installs} distinct folded installs; data as of ${report.dataAsOf ?? unknown}.`);
    for (const type of types) {
      lines.push(`${type}: ${cellText(zone.types[type])}`);
      for (const field of zone.fields.filter((f) => f.type === type)) lines.push(`  ${type}.${field.field}: ${cellText(field)}`);
    }
    const needs = zone.needs.filter((n) => args.type === undefined || n.type === args.type);
    // The score caps the combined list per zone, before a type filter. Never imply it is exhaustive.
    lines.push(`Reported fields needing installs: showing ${needs.length} matching entries from ${zone.needs.length}/${zone.needsTotal} listed across all types (the page's capped list). Values are withheld until 3 installs agree.`);
    for (const need of needs) {
      lines.push(`  ${need.type}.${need.field}: ${need.label}; ${need.voters}/3 agreeing installs; ${need.need} more needed; ${need.href ? `https://everloot.app${need.href}` : unknown}`);
    }
  }
  return `${lines.join("\n")}\nMore: ${page}\n${MCP_CREDIT}`;
}
