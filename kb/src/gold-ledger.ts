/**
 * A character's own gold ledger from uploads.
 * Peak gold and the money events an install actually saw stay on separate lines
 * from gameplay, which this slice does not record.
 * A missing line is unrecorded. The difference is never called bought, and never a ban.
 * Installs are not merged.
 */

export const INCOME_CATEGORIES = ["loot", "quest", "vendor", "auction"] as const;
export const SPENDING_CATEGORIES = ["flight", "postage", "barber", "respec", "auction_spend"] as const;
export const MONEY_CATEGORIES = [...INCOME_CATEGORIES, ...SPENDING_CATEGORIES] as const;

export type MoneyCategory = (typeof MONEY_CATEGORIES)[number];

const INCOME_LABEL: Record<(typeof INCOME_CATEGORIES)[number], string> = {
  loot: "Loot",
  quest: "Quest rewards",
  vendor: "Vendor sales",
  auction: "Auction sales",
};

const SPENDING_LABEL: Record<(typeof SPENDING_CATEGORIES)[number], string> = {
  flight: "Flight paths",
  postage: "Postage",
  barber: "Barber",
  respec: "Respecs",
  auction_spend: "Auction purchases",
};

export type GoldSnapshot = {
  installId: string;
  character: string;
  realm: string;
  currentCopper: number;
  peakCopper: number;
  seenAt: string;
};

export type MoneyEvent = {
  installId: string;
  character: string;
  realm: string;
  category: MoneyCategory;
  copper: number;
  seenAt: string;
};

function clean(value: string): string {
  return value.trim().toLowerCase();
}

export function formatCopper(copper: number): string {
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const coins = copper % 100;
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold}g`);
  if (silver > 0 || gold > 0) parts.push(`${silver}s`);
  parts.push(`${coins}c`);
  return parts.join(" ");
}

function joinEnglish(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function missingLine(items: string[]): string {
  const phrase = joinEnglish(items);
  const verb = items.length === 1 && !phrase.includes(" ") ? "is" : "are";
  const sentence = `${phrase} ${verb} unrecorded.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function validCopper(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 2_000_000_000;
}

function matches(character: string, realm: string, rowCharacter: string, rowRealm: string): boolean {
  return clean(rowCharacter) === clean(character) && clean(rowRealm) === clean(realm);
}

export function formatGoldLedger(character: string, realm: string, snapshots: GoldSnapshot[], events: MoneyEvent[]): string {
  const name = character.trim();
  const where = realm.trim();
  if (!name) return "Name a character.";
  if (!where) return "Name a realm.";

  const snaps = snapshots.filter((row) =>
    row.installId.trim()
    && matches(name, where, row.character, row.realm)
    && validCopper(row.currentCopper)
    && validCopper(row.peakCopper)
    && row.peakCopper >= row.currentCopper,
  );
  const rows = events.filter((row) =>
    row.installId.trim()
    && matches(name, where, row.character, row.realm)
    && (MONEY_CATEGORIES as readonly string[]).includes(row.category)
    && Number.isInteger(row.copper)
    && row.copper >= 1
    && row.copper <= 2_000_000_000,
  );
  const displayCharacter = snaps[0]?.character ?? rows[0]?.character ?? name;
  const displayRealm = snaps[0]?.realm ?? rows[0]?.realm ?? where;
  if (snaps.length === 0 && rows.length === 0) return `${displayCharacter} — ${displayRealm}\nGold unrecorded.`;

  const installs = [...new Set([...snaps.map((row) => row.installId.trim()), ...rows.map((row) => row.installId.trim())])].sort();
  const lines = [`${displayCharacter} — ${displayRealm}`, "Each install is its own ledger. Ledgers are not merged."];
  for (const installId of installs) {
    lines.push("", `Install ${installId}`);
    const mine = snaps.filter((row) => row.installId.trim() === installId).sort((a, b) => b.seenAt.localeCompare(a.seenAt));
    const latest = mine[0];
    const peak = mine.reduce((max, row) => Math.max(max, row.peakCopper), 0);
    if (!latest) lines.push("Peak gold unrecorded.");
    else {
      lines.push(`Peak gold: ${formatCopper(peak)}`);
      lines.push(`Current gold: ${formatCopper(latest.currentCopper)}`);
    }

    const sums = new Map<MoneyCategory, number>();
    for (const row of rows) {
      if (row.installId.trim() !== installId) continue;
      sums.set(row.category, (sums.get(row.category) ?? 0) + row.copper);
    }
    const seenIncome: string[] = [];
    const missedIncome: string[] = [];
    let income = 0;
    for (const category of INCOME_CATEGORIES) {
      const amount = sums.get(category);
      if (amount === undefined) missedIncome.push(INCOME_LABEL[category].toLowerCase());
      else {
        income += amount;
        seenIncome.push(`${INCOME_LABEL[category]}: ${formatCopper(amount)}`);
      }
    }
    if (seenIncome.length === 0) lines.push("Income is unrecorded.");
    else {
      lines.push(...seenIncome);
      if (missedIncome.length > 0) lines.push(missingLine(missedIncome));
    }

    const seenSpend: string[] = [];
    const missedSpend: string[] = [];
    for (const category of SPENDING_CATEGORIES) {
      const amount = sums.get(category);
      if (amount === undefined) missedSpend.push(SPENDING_LABEL[category].toLowerCase());
      else seenSpend.push(`${SPENDING_LABEL[category]}: ${formatCopper(amount)}`);
    }
    if (seenSpend.length === 0) lines.push("Spending is unrecorded.");
    else {
      lines.push(...seenSpend);
      if (missedSpend.length > 0) lines.push(`${joinEnglish(missedSpend)} ${missedSpend.length === 1 ? "is" : "are"} unrecorded.`);
    }

    lines.push("Gameplay is unrecorded.");
    if (latest && seenIncome.length > 0) {
      lines.push(`Recorded income is ${formatCopper(income)}. Peak gold is ${formatCopper(peak)}. The difference is unrecorded.`);
    }
  }
  return lines.join("\n");
}

export function handleGoldLedger(
  args: { character: string; realm: string },
  snapshots: GoldSnapshot[] = [],
  events: MoneyEvent[] = [],
): string {
  return formatGoldLedger(args.character, args.realm, snapshots, events);
}

function isCategory(value: unknown): value is MoneyCategory {
  return typeof value === "string" && (MONEY_CATEGORIES as readonly string[]).includes(value);
}

export function goldFactsFromRecords(records: unknown[]): { snapshots: GoldSnapshot[]; events: MoneyEvent[] } {
  const snapshots: GoldSnapshot[] = [];
  const events: MoneyEvent[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.installId !== "string" || typeof row.character !== "string" || typeof row.realm !== "string") continue;
    const seenAt = typeof row.capturedAt === "string" ? row.capturedAt : "";
    if (row.kind === "gold_snapshot" && typeof row.currentCopper === "number" && typeof row.peakCopper === "number") {
      snapshots.push({
        installId: row.installId,
        character: row.character,
        realm: row.realm,
        currentCopper: row.currentCopper,
        peakCopper: row.peakCopper,
        seenAt,
      });
    }
    if (row.kind === "money_event" && isCategory(row.category) && typeof row.copper === "number") {
      events.push({
        installId: row.installId,
        character: row.character,
        realm: row.realm,
        category: row.category,
        copper: row.copper,
        seenAt,
      });
    }
  }
  return { snapshots, events };
}
