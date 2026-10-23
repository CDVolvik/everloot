/**
 * Inline wiki templates that the generic converter would drop mid-sentence ("purchased for at
 * standing"), rendered to the words a reader would see. Everything not listed here is left for the
 * converter. Each handled template has a fixture test; the list grows only with one.
 *
 * One left-to-right pass: `{{` opens a buffer, `}}` closes the innermost one and renders it, so
 * nesting resolves innermost-first and the cost is linear in the page size. Past MAX_DEPTH the braces
 * are kept as text, so a pathological nest cannot make each close re-copy the whole page.
 */

/** Template names (lower-case) this module renders or removes, for the coverage page. */
export const REPAIRED_TEMPLATES = [
  "g", "s", "c", "cost", "money",
  "npc", "item", "quest", "spell", "zone", "ability", "race",
  "rep", "faction standing", "patch",
  "horde icon", "horde icon small", "alliance icon", "alliance icon small", "neutral icon", "neutral icon small",
  "alliance", "horde", "neutral",
  "wp", "wplink", "au", "alternate universe", "loot", "coppercost", "cv-ah",
  "co", "coords", "reputation", "quality", "costitem",
  "ss", "for", "stub", "removed",
];

const QUALIFIERS = new Set([
  "alliance", "horde", "neutral", "poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom",
]);

/** Stands in for a removed template until the line clean-up below; never appears in wikitext. */
const REMOVED = "\u0000";

/** Deepest template nest rendered; real pages stay in single digits. */
const MAX_DEPTH = 32;

/** Splits template arguments on top-level `|`, ignoring pipes inside nested `[[ ]]` (nested `{{ }}` are already rendered). */
function splitArgs(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === "[[") { depth++; cur += two; i++; continue; }
    if (two === "]]") { depth--; cur += two; i++; continue; }
    if (inner[i] === "|" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += inner[i];
  }
  out.push(cur);
  return out;
}

function money(parts: string[]): string {
  const [g, s, c] = [0, 1, 2].map((i) => (parts[i] ?? "").trim());
  const out: string[] = [];
  if (g && g !== "0") out.push(`${g}g`);
  if (s && s !== "0") out.push(`${s}s`);
  if (c && c !== "0") out.push(`${c}c`);
  return out.length > 0 ? out.join(" ") : (g || s || c ? "0c" : "");
}

/**
 * {{cost}}'s other currencies in the template's own order: the named argument(s), then the article the
 * icon links to. Read from Template:Cost in the 2023-11-13 dump; `eots` wins over its older name `es`.
 */
const CURRENCIES: Array<[string[], string]> = [
  [["ach"], "Achievement point"], [["cs"], "Champion's Seal"], [["djt"], "Dalaran Jewelcrafter's Token"], [["ea"], "Epicurean's Award"],
  [["tbc"], "Tol Barad Commendation"], [["ijt"], "Illustrious Jewelcrafter's Token"], [["mwt"], "Mark of the World Tree"], [["dpt"], "Darkmoon Prize Ticket"],
  [["it"], "Ironpaw Token"], [["lcgf"], "Lesser Charm of Good Fortune"], [["ecgf"], "Elder Charm of Good Fortune"], [["mrf"], "Mogu Rune of Fate"],
  [["ws"], "Warforged Seal"], [["tc"], "Timeless Coin"], [["bc"], "Bloody Coin"], [["twb"], "Timewarped Badge"],
  [["ss"], "Spirit Shard"], [["conq"], "Conquest"], [["hon"], "Honor"], [["diak"], "Dragon Isles Alchemy Knowledge"],
  [["dibk"], "Dragon Isles Blacksmithing Knowledge"], [["dienck"], "Dragon Isles Enchanting Knowledge"], [["diengk"], "Dragon Isles Engineering Knowledge"], [["dihk"], "Dragon Isles Herbalism Knowledge"],
  [["diik"], "Dragon Isles Inscription Knowledge"], [["dijk"], "Dragon Isles Jewelcrafting Knowledge"], [["dilk"], "Dragon Isles Leatherworking Knowledge"], [["dimk"], "Dragon Isles Mining Knowledge"],
  [["disk"], "Dragon Isles Skinning Knowledge"], [["ditk"], "Dragon Isles Tailoring Knowledge"], [["bt"], "Bloody Tokens"], [["dge"], "Dragon Glyph Embers"],
  [["dis"], "Dragon Isles Supplies"], [["efa"], "Effigy Adornments"], [["eo"], "Elemental Overflow"], [["sts"], "Storm Sigil"],
  [["pae"], "Purified Arcane Energy"], [["fs"], "Flightstones"], [["pf"], "Paracausal Flakes"], [["roab"], "Riders of Azeroth Badge"],
  [["arc"], "Argent Commendation"], [["cr"], "Cataloged Research"], [["cf"], "Cosmic Flux"], [["cfo"], "Cyphers of the First Ones"],
  [["go"], "Grateful Offering"], [["ir"], "Infused Ruby"], [["ph"], "Phantasma"], [["ra"], "Reservoir Anima"],
  [["rs"], "Redeemed Soul"], [["sf"], "Sinstone Fragments"], [["sa"], "Soul Ash"], [["sc"], "Soul Cinders"],
  [["st"], "Stygia"], [["7sm"], "7th Legion Service Medal"], [["cv"], "Coalescing Visions"], [["cm"], "Corrupted Mementos"],
  [["eon"], "Echoes of Ny'alotha"], [["hsm"], "Honorbound Service Medal"], [["pm"], "Prismatic Manapearl"], [["sd"], "Seafarer's Dubloon"],
  [["tr"], "Titan Residuum"], [["wr"], "War Resources"], [["am"], "Ancient Mana"], [["bg"], "Brawler's Gold"],
  [["ca"], "Coins of Air"], [["cc"], "Curious Coin"], [["moh"], "Mark of Honor"], [["ns"], "Nethershard"],
  [["or"], "Order Resources"], [["sbf"], "Seal of Broken Fate"], [["se"], "Sightless Eye"], [["ta"], "Timeworn Artifact"],
  [["tst"], "Trial of Style Token"], [["lws"], "Legionfall War Supplies"], [["va"], "Veiled Argunite"], [["eob"], "Echoes of Battle"],
  [["eod"], "Echoes of Domination"], [["we"], "Wakening Essence"], [["ac"], "Apexis Crystal"], [["af"], "Artifact Fragment"],
  [["gr"], "Garrison Resources"], [["oil"], "Oil (currency)"], [["stf"], "Seal of Tempered Fate"], [["sif"], "Seal of Inevitable Fate"],
  [["dic"], "Dingy Iron Coins"], [["v"], "Valor"], [["dca"], "Epicurean's Award"], [["h"], "Honor Points"],
  [["h-h"], "Honor Points"], [["a-h"], "Honor Points"], [["wsg"], "Warsong Gulch Mark of Honor"], [["ab"], "Arathi Basin Mark of Honor"],
  [["av"], "Alterac Valley Mark of Honor"], [["eots", "es"], "Eye of the Storm Mark of Honor"], [["sota"], "Strand of the Ancients Mark of Honor"], [["ic"], "Isle of Conquest Mark of Honor"],
  [["w"], "Wintergrasp Mark of Honor"], [["a"], "Arena point"], [["sks"], "Stone Keeper's Shard"], [["vc"], "Venture Coin"],
  [["boj"], "Badge of Justice"], [["eoh"], "Emblem of Heroism"], [["eov"], "Emblem of Valor"], [["eoc"], "Emblem of Conquest"],
  [["eot"], "Emblem of Triumph"], [["eof"], "Emblem of Frost"], [["vp"], "Valor Points"], [["jp"], "Justice Points"],
  [["hp"], "Honor Points"], [["h-hp"], "Honor Points"], [["a-hp"], "Honor Points"], [["cp"], "Conquest Points"],
  [["h-cp"], "Conquest Points"], [["a-cp"], "Conquest Points"],
];

/** {{cost}}: gold, silver and copper (named g/s/c win over 1/2/3), then each other currency as "amount Name", then a custom name=/cost= pair. */
function cost(positional: string[], named: Record<string, string>): string {
  const out = [money([named.g ?? positional[0], named.s ?? positional[1], named.c ?? positional[2]])];
  for (const [codes, currency] of CURRENCIES) {
    const amount = codes.map((k) => named[k]).find((v) => v !== undefined);
    if (amount) out.push(`${amount} ${currency}`);
  }
  if (named.name) out.push(`${named.cost ?? ""} ${named.name}`.trim());
  return out.filter(Boolean).join(" ");
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The rendering for one template (its inner text, nested templates already rendered), or null when it is not ours. */
function render(inner: string): string | null {
  const args = splitArgs(inner);
  const name = args[0].trim().toLowerCase();
  const positional = args.slice(1).filter((a) => !a.includes("=")).map((a) => a.trim());
  const named = Object.fromEntries(
    args.slice(1).filter((a) => a.includes("=")).map((a) => [a.slice(0, a.indexOf("=")).trim().toLowerCase(), a.slice(a.indexOf("=") + 1).trim()]),
  ) as Record<string, string>;

  if (name === "g" || name === "s" || name === "c") return name;
  if (name === "cost") return cost(positional, named);
  if (name === "money") return money(positional);
  if (name === "rep" || name === "faction standing") return capitalise(positional[0] ?? "");
  if (name === "race") return positional[0] ?? "";
  if (/^patch \d/.test(name)) return `${capitalise(args[0].trim())}${named.note ? `: ${named.note}` : ""}`;
  if (["npc", "item", "quest", "spell", "zone", "ability"].includes(name)) {
    if (positional.length === 0) return "";
    if (positional.length >= 2 && (positional[0] === "" || QUALIFIERS.has(positional[0].toLowerCase()))) {
      return positional[positional.length - 1] || positional[1];
    }
    return positional[positional.length - 1];
  }
  // {{wp|Article|label}} links Wikipedia, {{au|Name|label}} the "Name (alternate universe)" page; both show the label or the name.
  if (["wp", "wplink", "au", "alternate universe"].includes(name)) return positional[1] || positional[0] || "";
  // {{loot|quality|Item|label}}: the label, else the item name.
  if (name === "loot") return positional[2] || positional[1] || "";
  // {{coppercost|86000}}: one copper amount, shown as gold, silver and copper.
  if (name === "coppercost") {
    const copper = (positional[0] ?? "").replace(/,/g, "");
    if (!/^\d+$/.test(copper)) return null;
    const n = Number(copper);
    return money([String(Math.floor(n / 10000)), String(Math.floor((n % 10000) / 100)), String(n % 100)]);
  }
  // {{cv-AH|Alliance text|Horde text}}: the wiki shows one side by the reader's faction, "A or H" without it.
  if (name === "cv-ah") return [positional[0], positional[1]].filter(Boolean).join(" or ");
  // {{co|47|78|Arathi Highlands}} (a redirect to {{coords}}) shows the map coordinates as "[47, 78]".
  if (name === "co" || name === "coords") return `[${positional[0] || "0"}, ${positional[1] || "0"}]`;
  // {{reputation|Revered}}, {{quality|epic|Item|label}}: the label, else the link, else the standing or quality as written.
  if (name === "reputation" || name === "quality") return positional[2] || positional[1] || positional[0] || "";
  // {{costitem|8|Bolt of Embersilk Cloth}} is the count and the item's icon; the item name stands in for the icon.
  if (name === "costitem") {
    const count = positional[0] || "1";
    const shown = /^\d+$/.test(count) ? Number(count).toLocaleString("en-US") : count;
    return positional[1] ? `${shown}${named.numsep ?? " "}${positional[1]}` : shown;
  }
  // {{Alliance}}, {{Horde}}, {{Neutral}} are the small faction icon alone.
  if (/^(horde|alliance|neutral)( icon( small)?)?$/.test(name)) return REMOVED;
  if (name === "ss" || name === "for" || name === "removed" || name.startsWith("stub")) return REMOVED;
  return null;
}

/** Renders the handled templates to text in one pass, leaving unknown templates and all line structure untouched. */
export function repairTemplates(wikitext: string): string {
  const stack: string[] = [];
  let cur = "";
  let literal = 0; // opens past MAX_DEPTH, kept as text along with their closes
  for (let i = 0; i < wikitext.length; i++) {
    const two = wikitext.slice(i, i + 2);
    if (two === "{{" && stack.length >= MAX_DEPTH) { literal++; cur += two; i++; continue; }
    if (two === "}}" && literal > 0) { literal--; cur += two; i++; continue; }
    if (two === "{{") { stack.push(cur); cur = ""; i++; continue; }
    if (two === "}}" && stack.length > 0) {
      const inner = cur;
      cur = stack.pop()!;
      const rendered = render(inner);
      cur += rendered === null ? `{{${inner}}}` : rendered;
      i++;
      continue;
    }
    cur += wikitext[i];
  }
  // Unclosed `{{`: put the raw opening back and keep whatever was rendered inside it.
  while (stack.length > 0) cur = `${stack.pop()!}{{${cur}`;
  // A removed template leaves its spacing behind: drop lines that held only removed templates, and
  // collapse the spaces around removed templates inside a line. Blank lines and indentation stay.
  return cur
    .split("\n")
    .filter((line) => !(line.includes(REMOVED) && line.replace(new RegExp(REMOVED, "g"), "").trim() === ""))
    .map((line) => (line.includes(REMOVED) ? line.replace(new RegExp(`^(${REMOVED} *)+`), "").replace(new RegExp(` *${REMOVED} *`, "g"), " ").replace(/ +$/, "") : line))
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

const DAMAGE_PATTERNS = [/ for at /, / at standing/, / at {2}/, / {2}standing/, /\w {2}\w/];

/** How many breakage patterns the converted text shows; 0 means clean. */
export function countDamage(text: string): number {
  return DAMAGE_PATTERNS.filter((re) => re.test(text)).length;
}
