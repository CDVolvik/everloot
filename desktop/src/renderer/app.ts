import { accountOf as account } from "../main/engine";
import { diagnostics } from "../shared/diagnostics";
import type { AddonInfo, AppState, AskInfo, BackupInfo, ChangeItem, CharactersInfo, ChatInfo, EverlootApi, FileSummary, GameFolderCandidate, Job, JobStatus, MarketInfo } from "../shared/types";

declare global { interface Window { everloot: EverlootApi } }
const api = window.everloot;

type Page = "overview" | "chat" | "characters" | "upload" | "market" | "ask" | "addon" | "changes" | "log" | "settings" | `site:${string}`;
const PAGES: { id: Page; label: string; job?: Job }[] = [
  { id: "overview", label: "Overview" },
  { id: "chat", label: "Chat" },
  { id: "characters", label: "Characters" },
  { id: "upload", label: "Upload", job: "upload" },
  { id: "market", label: "Market", job: "prices" },
  { id: "ask", label: "Ask", job: "ask" },
  { id: "addon", label: "Addon" },
  { id: "changes", label: "Changes" },
  { id: "log", label: "Log" },
  { id: "settings", label: "Settings" },
];

let state: AppState | null = null;
let page: Page = "overview";
let candidates: GameFolderCandidate[] = [];
let chosenFolder: string | null = null;
let draftDirty = false;
let busy = "";
let flash = "";
let siteUrl: string | null = null;
const data: { upload?: FileSummary[]; backups?: BackupInfo[]; market?: MarketInfo; ask?: AskInfo; addon?: AddonInfo; changes?: ChangeItem[]; changesError?: string; characters?: CharactersInfo; chat?: ChatInfo } = {};

const main = document.getElementById("app")!;
const side = document.getElementById("side")!;
const nav = document.getElementById("nav")!;
const sideFoot = document.getElementById("side-foot")!;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const gold = (copper: number | null) => {
  if (copper === null) return "–";
  const g = Math.floor(copper / 10000), s = Math.floor((copper % 10000) / 100), c = copper % 100;
  return g ? `${g.toLocaleString()}g ${s}s` : s ? `${s}s ${c}c` : `${c}c`;
};
// IPC wraps a thrown error as "Error invoking remote method 'x': Error: ..."; the page shows only the reason.
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': /, "").replace(/^(?:Type)?Error: /, "");
const ext = (url: string, text: string) => `<button type="button" class="link" data-open="${esc(url)}">${esc(text)}</button>`;

function statusText(j: JobStatus): string {
  switch (j.state) {
    case "off": return "Off";
    case "idle": return "Waiting for the next write";
    case "running": return "Running";
    case "ok": return j.message || "Done";
    case "error": return j.message;
  }
}
const dot = (j: JobStatus) => `<span class="dot dot-${j.state}" aria-hidden="true"></span>`;
const onOff = (job: Job, s: AppState) => (job === "ask" ? s.settings.ask.enabled : s.settings[job]);
const jobSwitch = (job: Job, s: AppState) => `<label class="switch"><input type="checkbox" data-toggle="${job}" ${onOff(job, s) ? "checked" : ""}><span>${onOff(job, s) ? "On" : "Off"}</span></label>`;
const runBtn = (job: Job, s: AppState, label = "Run now") => `<button type="button" class="btn" data-run="${job}" ${onOff(job, s) && s.engine.files.length && !s.engine.paused && s.engine.jobs[job].state !== "running" ? "" : "disabled"}>${label}</button>`;
const logLines = (s: AppState, n: number) => s.engine.log.slice(-n).reverse().map((l) => `<div><time>${clock(l.at)}</time><span class="${l.level}">${esc(l.text)}</span></div>`).join("") || '<span class="muted">Nothing yet.</span>';

// ---------- screens ----------

function welcome(): string {
  const list = candidates.length
    ? `<div class="choices">${candidates.map((c) => `
        <label class="choice"><input type="radio" name="folder" value="${esc(c.folder)}" ${chosenFolder === c.folder ? "checked" : ""}>
          <span class="grow"><span class="mono">${esc(c.product)}</span> <span class="muted">${c.files ? `${c.files} account file(s) with Everloot data` : c.hasAccounts ? "no Everloot data yet" : "never played here yet"}</span><br><span class="muted mono small">${esc(c.folder)}</span></span></label>`).join("")}</div>`
    : `<p class="muted">No World of Warcraft folder was found in the usual places. Browse to the folder that holds <code>WTF</code>, for example <code>World of Warcraft\\_classic_era_</code>.</p>`;
  const custom = chosenFolder && !candidates.some((c) => c.folder === chosenFolder) ? `<p class="mono fg2">${esc(chosenFolder)}</p>` : "";
  return `<div class="welcome">
    <div><h1>Set up Everloot Desktop</h1>
      <p class="lead">It runs in the tray beside the game: uploads what the addon recorded after every logout, keeps market prices in your tooltips, installs addon updates, carries the site's tools and a chat over Everloot's data, and, if you turn it on, answers <code>/ask</code>.</p></div>
    <section class="panel">
      <h2>What leaves this computer</h2>
      <ul class="plain fg2">
        <li>Anonymous observations from <code>Everloot.lua</code>: drops, vendors, recipes, spawns, auction scans. No character or account name.</li>
        <li>Nothing else. Named data (guild, gear, gold, collection) and your installed addon list stay here; share those on the website if you want to.</li>
      </ul>
      <p class="small fg2">Uploaded observations are published under CC BY-SA 4.0, credited to Everloot contributors. Source: ${ext("https://github.com/Everloot/everloot", "github.com/Everloot/everloot")} · Rules: ${ext("https://everloot.app/privacy", "everloot.app/privacy")}</p>
    </section>
    <section class="panel">
      <h2>Which game folder?</h2>
      ${list}${custom}
      <div class="row"><button type="button" class="btn" id="browse">Browse…</button><button type="button" class="btn" id="redetect">Look again</button></div>
    </section>
    <div class="row"><button type="button" class="btn btn-primary btn-lg" id="start" ${chosenFolder ? "" : "disabled"}>Start</button><span class="muted">Nothing runs before you press Start.</span></div>
  </div>`;
}

function overview(s: AppState): string {
  const e = s.engine;
  const up = e.jobs.upload, pr = e.jobs.prices, ask = e.jobs.ask;
  const addon = data.addon;
  const addonLine = !addon ? "…" : addon.installed
    ? (addon.latest && addon.latest.version !== addon.installed ? `${addon.installed} <span class="warn">→ ${addon.latest.version} available</span>` : `${addon.installed}${addon.latest ? ' <span class="ok">up to date</span>' : ""}`)
    : '<span class="warn">not installed</span>';
  const changes = (data.changes ?? []).slice(0, 5);
  return `<div class="page">
    <div class="head"><h1>Overview</h1><span class="sub">${e.files.length ? `Watching ${e.files.length} account file(s)` : "Not watching a game folder"}${e.paused ? " · paused" : ""}</span></div>
    ${s.notice ? `<p class="error">${esc(s.notice)}</p>` : ""}
    ${s.update?.newer && s.update.url ? `<p class="fg2">Everloot Desktop ${esc(s.update.latest ?? "")} is out; you run ${esc(s.version)}. ${ext(s.update.url, "Download it")} and install over this one; your settings stay.</p>` : ""}
    ${!e.files.length && s.settings.gameFolder ? `<p class="fg2">No <code>Everloot.lua</code> under <span class="mono">${esc(s.settings.gameFolder)}</span> yet. Log out once in the game so it writes the file.</p>` : ""}
    <div class="stats">
      <div class="stat"><div class="k">Upload</div><div class="v">${dot(up)} ${up.state === "ok" ? "OK" : up.state === "error" ? "Failed" : up.state === "off" ? "Off" : "Waiting"}</div><div class="s">${up.at ? ago(up.at) : "never"}</div></div>
      <div class="stat"><div class="k">Market prices</div><div class="v">${dot(pr)} ${data.market ? `${data.market.last.length} realm(s)` : pr.state === "off" ? "Off" : "Waiting"}</div><div class="s">${data.market?.scans[0] ? `your last scan ${ago(data.market.scans[0].at)}` : pr.at ? ago(pr.at) : "never"}</div></div>
      <div class="stat"><div class="k">/ask</div><div class="v">${dot(ask)} ${ask.state === "off" ? "Off" : ask.state === "error" ? "Failed" : "On"}</div><div class="s">${ask.at ? ago(ask.at) : s.settings.ask.enabled ? "waiting" : "turn on in Ask"}</div></div>
      <div class="stat"><div class="k">Addon</div><div class="v">${addonLine}</div><div class="s">${addon?.slots.prices ? "prices file in game" : "no prices file yet"}</div></div>
    </div>
    <div class="grid2">
      <section class="panel"><div class="row between"><h2>Recent activity</h2><div class="row">${runBtn("upload", s, "Upload now")}${runBtn("prices", s, "Refresh prices")}</div></div><div class="log">${logLines(s, 8)}</div></section>
      <section class="panel"><div class="row between"><h2>Latest changes</h2><button type="button" class="link" data-page="changes">all</button></div>
        <div class="list">${changes.length ? changes.map((c) => `<div class="item"><div class="t">${c.link ? ext(c.link, c.title) : esc(c.title)}</div><div class="muted small">${when(c.date)}</div></div>`).join("") : `<span class="muted">${data.changesError ? esc(data.changesError) : "Loading…"}</span>`}</div></section>
    </div>
  </div>`;
}

function chat(): string {
  const c = data.chat;
  const thread = (c?.messages ?? []).map((m) => {
    const meta = m.role === "assistant"
      ? `<div class="meta">${m.model ? `<b>${esc(m.model)}</b>` : "<b>plain search</b>"}${m.steps.length ? ` · ${m.steps.length} tool call(s): ${esc(m.steps.map((st) => st.tool).join(", "))}` : ""}${m.sources.length ? `<br>Sources: ${m.sources.map((x) => esc(x)).join(" · ")}` : ""}</div>`
      : `<div class="meta">${clock(m.at)}</div>`;
    return `<div class="msg msg-${m.role}">${esc(m.text)}${meta}</div>`;
  }).join("");
  return `<div class="page chat">
    <div class="head"><h1>Chat</h1><span class="sub">${c ? `${esc(c.mode)} · ${c.withToken ? "your MCP token" : "public MCP, rate limited"}` : ""} <button type="button" class="link" id="chatClear">clear</button></span></div>
    <p class="muted small">Answers come only from Everloot's own MCP tools, with their sources. With your Anthropic key the model works the tools itself; without one you get the sourced search hits. Private: the transcript stays in your data folder.</p>
    ${c && !c.ownKey && c.mode === "plain search" ? `<form id="keyForm" class="row" autocomplete="off"><input type="password" name="key" placeholder="Paste your Anthropic API key (sk-ant-...)" spellcheck="false" style="flex:1"><select name="model"><option value="claude-sonnet-5-5">Sonnet 5.5</option><option value="claude-opus-5-5">Opus 5.5</option><option value="claude-haiku-5-5">Haiku 5.5</option></select><button type="submit" class="btn">Use my key</button></form>
    <p class="muted small">The key is written to <code>anthropic.key</code> in your data folder and named from <code>config.json</code>, the way the command line reads it (${ext("https://everloot.app/connect", "details")}). It goes to Anthropic only, with your questions and the tool results.</p>` : ""}
    ${c?.ownKey ? `<p class="muted small">Using the key saved from this page. <button type="button" class="link" id="removeKey">Remove it</button></p>` : ""}
    ${flash ? `<p class="${flash.startsWith("!") ? "error" : "ok"} small">${esc(flash.replace(/^!/, ""))}</p>` : ""}
    <div class="thread" id="thread">${thread || '<span class="muted">Ask anything about WoW: Forever: a drop, a vendor, a recipe, a price, a quest.</span>'}${c?.busy ? '<div class="msg msg-assistant muted">Answering…</div>' : ""}${c?.error ? `<div class="msg msg-assistant error">${esc(c.error)}</div>` : ""}</div>
    <form id="chatForm"><textarea id="chatText" rows="2" placeholder="Ask about Forever. Enter sends, Shift+Enter is a new line." ${c?.busy ? "disabled" : ""}></textarea><button type="submit" class="btn btn-primary" ${c?.busy ? "disabled" : ""}>Send</button></form>
  </div>`;
}

/** A 96x24 line of a character's gold over time; nothing for fewer than two points. */
function sparkline(points: { at: string; copper: number }[]): string {
  if (points.length < 2) return "";
  const w = 96, h = 24, lo = Math.min(...points.map((p) => p.copper)), hi = Math.max(...points.map((p) => p.copper));
  const y = (v: number) => (hi === lo ? h / 2 : h - 1 - ((v - lo) / (hi - lo)) * (h - 2));
  const d = points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * (w - 1)).toFixed(1)},${y(p.copper).toFixed(1)}`).join(" ");
  const first = points[0].at.slice(0, 10), last = points[points.length - 1].at.slice(0, 10);
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="gold from ${first} to ${last}"><title>${points.length} snapshots, ${first} to ${last}</title><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
}

function characters(): string {
  const c = data.characters;
  const rows = (c?.characters ?? []).map((r) => {
    const spent = Object.values(r.spent).reduce((a, b) => a + b, 0), earned = Object.values(r.earned).reduce((a, b) => a + b, 0);
    const net = r.week.earned - r.week.spent;
    const week = r.week.earned || r.week.spent ? `<span class="${net >= 0 ? "ok" : "warn"}">${net >= 0 ? "+" : "-"}${gold(Math.abs(net))}</span><div class="muted small">+${gold(r.week.earned)} / -${gold(r.week.spent)}</div>` : "–";
    return `<tr><td>${esc(r.character)}<div class="muted small">${esc(r.realm)}</div></td><td class="num">${gold(r.gold)}${sparkline(r.history)}</td><td class="num muted">${gold(r.peakGold)}</td><td class="num">${week}</td><td class="num">${r.itemLevel ?? "–"}<div class="muted small">${r.gearSlots ? `${r.gearSlots} slots` : ""}</div></td><td class="num">${earned ? gold(earned) : "–"}</td><td class="num">${spent ? gold(spent) : "–"}</td></tr>`;
  }).join("");
  const prog = (c?.progress ?? []).map((p) => `<tr><td><span class="mono">${esc(p.key)}</span></td><td>${esc(p.class.toLowerCase())} ${p.level}</td><td class="num">${p.achievements}${p.achievementsInProgress ? `<span class="muted"> +${p.achievementsInProgress} in progress</span>` : ""}</td><td class="num">${p.reputations}${p.exalted ? `<span class="muted"> · ${p.exalted} exalted</span>` : ""}</td><td class="num">${p.titles}</td><td class="num">${p.quests}</td></tr>`).join("");
  return `<div class="page">
    <div class="head"><h1>Characters</h1><span class="sub">from the addon's save file · never uploaded from here</span></div>
    <p class="fg2">What the addon recorded about your own characters. Gold and gear carry the name; progress rows carry an opaque key the addon derives per character, so they are listed apart. Sharing any of this with the site is a choice you make on the upload page with a verified grant, never here.</p>
    <section class="panel"><div class="row between"><h2>Gold and gear</h2><span class="muted small">the line under Gold is every snapshot the addon kept, oldest to newest</span></div>
      ${rows ? `<table><thead><tr><th>Character</th><th class="num">Gold</th><th class="num">Peak</th><th class="num">7 days</th><th class="num">Item level</th><th class="num">Earned</th><th class="num">Spent</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="muted">${c ? "No gold or gear snapshot yet. The addon records them while you play." : "Loading…"}</p>`}
    </section>
    <section class="panel"><h2>Progress</h2>
      ${prog ? `<table><thead><tr><th>Key</th><th>Class</th><th class="num">Achievements</th><th class="num">Reputations</th><th class="num">Titles</th><th class="num">Quests done</th></tr></thead><tbody>${prog}</tbody></table>` : `<p class="muted">${c ? "Nothing yet. The completion tracker is off until <code>/everloot completion on</code> in game." : "Loading…"}</p>`}
      ${c?.talents.length ? `<p class="muted small">Active talent builds: ${c.talents.map((t) => `${esc(t.class.toLowerCase())} ${t.level} (${t.points} points)`).join(", ")}.</p>` : ""}
    </section>
  </div>`;
}

function upload(s: AppState): string {
  const j = s.engine.jobs.upload;
  const files = data.upload ?? [];
  const rows = files.map((f) => `<tr>
      <td><span class="mono">${esc(account(f.file))}</span>${f.ok ? "" : `<div class="error small">${esc(f.error ?? "unreadable")}</div>`}</td>
      <td>${when(f.writtenAt)}<div class="muted small">${kb(f.bytes)}</div></td>
      <td>${f.addonVersion ? esc(f.addonVersion) : "–"}<div class="muted small">${f.clientBuild ? esc(f.clientBuild) : ""}</div></td>
      <td class="num">${f.records}</td><td class="num">${f.confirmed}</td>
      <td><div class="chips">${f.kinds.slice(0, 12).map((k) => `<span class="chip"><b>${k.count}</b> ${esc(k.kind)}</span>`).join("")}${f.kinds.length > 12 ? `<span class="chip">+${f.kinds.length - 12} more</span>` : ""}</div></td>
    </tr>`).join("");
  const backups = (data.backups ?? []).map((b) => `<tr><td><span class="mono">${esc(b.account)}</span></td><td>${when(b.at)}</td><td class="num">${kb(b.bytes)}</td><td><button type="button" class="btn small" data-restore="${esc(b.file)}" ${busy ? "disabled" : ""}>${busy === b.file ? "Restoring…" : "Restore"}</button></td></tr>`).join("");
  return `<div class="page">
    <div class="head"><h1>Upload</h1><div class="row">${jobSwitch("upload", s)}${runBtn("upload", s)}</div></div>
    <p class="fg2">After every logout or <code>/reload</code> the game rewrites <code>Everloot.lua</code>; once the write settles, the events the site has not confirmed are sent. Named data (guild, gear, gold, collection) and your installed addon list stay here.</p>
    <section class="panel"><div class="row between"><h2>Last run</h2><span class="muted small">${j.at ? when(j.at) : ""}</span></div><p class="${j.state === "error" ? "error" : "fg2"}">${esc(statusText(j))}</p></section>
    <section class="panel"><h2>Account files</h2>
      ${files.length ? `<table><thead><tr><th>Account</th><th>Written</th><th>Addon</th><th class="num">Records</th><th class="num">Confirmed</th><th>What it holds</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No account file yet.</p>'}
      <p class="muted small">Records are what the addon has on disk; confirmed is how many of them the site has accepted from this install. The site states a fact once three installs agree.</p>
    </section>
    <section class="panel"><div class="row between"><h2>Backups</h2><button type="button" class="btn" id="openBackups" ${(data.backups ?? []).length ? "" : "disabled"}>Open folder</button></div>
      ${backups.length ? `<table><thead><tr><th>Account</th><th>Taken</th><th class="num">Size</th><th></th></tr></thead><tbody>${backups}</tbody></table>` : '<p class="muted">No backup yet. One is kept after each upload.</p>'}
      <p class="muted small">A copy of <code>Everloot.lua</code> as it was uploaded, the newest ten per account. Restore while logged out; the file you replace is backed up first.</p>
      ${flash ? `<p class="${flash.startsWith("!") ? "error" : "ok"} small">${esc(flash.replace(/^!/, ""))}</p>` : ""}
    </section>
  </div>`;
}

function market(s: AppState): string {
  const j = s.engine.jobs.prices;
  const m = data.market;
  const followed = new Set((m?.followed ?? s.settings.market.realms).map((r) => r.toLowerCase()));
  const own = new Set((m?.own ?? []).map((r) => r.toLowerCase()));
  const known = m?.known ?? [];
  const checks = known.length
    ? `<div class="checks">${known.map((r) => `<label class="check"><input type="checkbox" data-realm="${esc(r)}" ${followed.has(r.toLowerCase()) ? "checked" : ""} ${own.has(r.toLowerCase()) ? "disabled checked" : ""}> ${esc(r)}${own.has(r.toLowerCase()) ? ' <span class="muted small">(your scans)</span>' : ""}</label>`).join("")}</div>`
    : `<p class="muted">${m?.error ? esc(m.error) : m ? "The site has no public values yet. A realm appears once three reporters scanned it." : "Loading…"}</p>`;
  const extra = [...followed].filter((r) => !known.some((k) => k.toLowerCase() === r));
  const last = m?.last ?? [];
  const stale = (at: string | null) => !at || Date.now() - new Date(at).getTime() > 24 * 3600 * 1000;
  const scans = (m?.scans ?? []).map((sc) => `<tr><td>${esc(sc.realm)}</td><td>${sc.at ? ago(sc.at) : "unknown"}</td><td class="${stale(sc.at) ? "warn" : "ok"}">${stale(sc.at) ? "scan again next time you are at the auction house" : "fresh"}</td></tr>`).join("");
  return `<div class="page">
    <div class="head"><h1>Market</h1><div class="row">${jobSwitch("prices", s)}${runBtn("prices", s, "Refresh now")}</div></div>
    <p class="fg2">Community market values written into <code>EverlootPrices</code> so item tooltips show them after <code>/reload</code>. Realms from your own auction scans are always included; pick more below, the way TSM lets you pick realms, except the values are Everloot's own: a day counts once three reporters scanned it. Refreshed after each upload and every hour.</p>
    <section class="panel"><div class="row between"><h2>Realms to carry into the game</h2><span class="muted small">${m?.dataAsOf ? `site data as of ${when(m.dataAsOf)}` : ""}</span></div>
      ${checks}
      <div class="row"><input type="text" id="realmAdd" class="grow" placeholder="Add a realm by name" maxlength="60"><button type="button" class="btn" id="realmAddBtn">Follow</button></div>
      ${extra.length ? `<div class="chips">${extra.map((r) => `<span class="chip">${esc(r)} <button type="button" class="link" data-unfollow="${esc(r)}">remove</button></span>`).join("")}</div>` : ""}
      <p class="muted small">At most 20 realms in one prices file; your scans come first. The full tables and 60-day charts are on the Auction prices tool in the sidebar.</p>
    </section>
    <section class="panel"><h2>Your scans</h2>
      ${scans ? `<table><thead><tr><th>Realm</th><th>Last full scan</th><th>Status</th></tr></thead><tbody>${scans}</tbody></table>` : '<p class="muted">No full scan yet. At the auction house, press the <b>Everloot scan</b> button or type <code>/everloot scan</code>; the scan uploads after your next logout.</p>'}
      <p class="muted small">Every scan you upload is one of the three reporters a day needs before a price is published. A realm is only as fresh as its last scans.</p>
    </section>
    <section class="panel"><div class="row between"><h2>Written into the game</h2><span class="muted small">${j.at ? when(j.at) : ""}</span></div>
      ${j.state === "error" ? `<p class="error">${esc(j.message)}</p>` : ""}
      ${last.length ? `<table><thead><tr><th>Realm</th><th class="num">Items</th><th>Data as of</th><th>Why</th></tr></thead><tbody>${last.map((r) => `<tr><td>${esc(r.realm)}</td><td class="num">${r.items}</td><td>${r.dataAsOf ? when(r.dataAsOf) : "–"}</td><td class="muted">${r.source === "scan" ? "your scans" : "followed"}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">Nothing written yet this session.</p>'}
    </section>
  </div>`;
}

function ask(s: AppState): string {
  const j = s.engine.jobs.ask;
  const a = data.ask;
  const st = s.settings.ask;
  const pending = (a?.pending ?? []).flatMap((p) => p.asks.map((q) => ({ ...q, account: account(p.file) })));
  return `<div class="page">
    <div class="head"><h1>Ask</h1><div class="row">${jobSwitch("ask", s)}${runBtn("ask", s, "Answer now")}</div></div>
    <p class="fg2"><code>/ask</code> questions from the game are answered from the Everloot MCP server and written into <code>EverlootAnswers</code>; they show after <code>/reload</code>. Every answer names its source; with no source there is no answer. The same setup serves the Chat page.</p>
    <form id="askForm" class="panel" autocomplete="off">
      <div class="grid2">
        <div class="field"><label for="mcpUrl">MCP server</label><input type="url" id="mcpUrl" name="mcpUrl" value="${esc(st.mcpUrl)}"></div>
        <div class="field"><label for="tokenFile">Token file <span class="hint">a file holding your key from ${ext("https://everloot.app/connect", "everloot.app/connect")}; the key is never typed here</span></label>
          <div class="row"><input class="grow" type="text" id="tokenFile" name="tokenFile" value="${esc(st.tokenFile ?? "")}"><button type="button" class="btn" id="pickToken">Choose…</button></div></div>
      </div>
      <div class="row"><button type="submit" class="btn btn-primary">Save</button><span class="muted" id="saved"></span></div>
    </form>
    <div class="grid2">
      <section class="panel"><h2>Who answers</h2>
        ${a?.providerError ? `<p class="error">${esc(a.providerError)}</p>` : a?.providers.length ? `<p>Model: <b>${esc(a.providers.join(" > "))}</b>, writing at most two sentences from the top three sourced hits.</p>` : "<p>Plain search: the top sourced hit, no model.</p>"}
        <p class="muted small">An Anthropic key pasted on the <button type="button" class="link" data-page="chat">Chat page</button> answers here too. Other providers go in <code>config.json</code> in the data folder (any OpenAI-compatible server, keys from a file). <button type="button" class="link" id="openConfig">Open config.json</button></p>
        <p class="${j.state === "error" ? "error" : "fg2"} small">${esc(statusText(j))}</p>
      </section>
      <section class="panel"><h2>Pending in game</h2>
        ${pending.length ? `<div class="list">${pending.map((q) => `<div class="item"><div class="t">${esc(q.question)}</div><div class="muted small">${esc(q.account)} · ${when(q.askedAt)}</div></div>`).join("")}</div>` : '<p class="muted">No question waiting.</p>'}
      </section>
    </div>
    <section class="panel"><h2>Recent answers</h2>
      ${a?.answers.length ? `<div class="list">${a.answers.slice(0, 20).map((x) => `<div class="item"><div>${esc(x.answer)}</div><div class="muted small">${esc(x.source)} · ${when(x.answeredAt)}</div></div>`).join("")}</div>` : '<p class="muted">Nothing answered yet.</p>'}
    </section>
  </div>`;
}

function addon(s: AppState): string {
  const a = data.addon;
  const newer = a?.installed && a.latest && a.latest.version !== a.installed;
  return `<div class="page">
    <div class="head"><h1>Addon</h1><span class="sub">${a?.addonsDir ? `<span class="mono">${esc(a.addonsDir)}</span>` : "no game folder"}</span></div>
    <div class="stats">
      <div class="stat"><div class="k">Installed</div><div class="v">${a ? (a.installed ? esc(a.installed) : '<span class="warn">not installed</span>') : "…"}</div></div>
      <div class="stat"><div class="k">Latest release</div><div class="v">${a ? (a.latest ? esc(a.latest.version) : "–") : "…"}</div><div class="s">${a?.error ? `<span class="error">${esc(a.error)}</span>` : a?.latest ? ext(a.latest.url, "release notes") : ""}</div></div>
      <div class="stat"><div class="k">Prices file</div><div class="v">${a?.slots.prices ? '<span class="ok">present</span>' : "none"}</div><div class="s">EverlootPrices</div></div>
      <div class="stat"><div class="k">Answers file</div><div class="v">${a?.slots.answers ? '<span class="ok">present</span>' : "none"}</div><div class="s">EverlootAnswers</div></div>
    </div>
    <section class="panel">
      <h2>${a?.installed ? (newer ? "Update" : "Reinstall") : "Install"}</h2>
      <p class="fg2">Downloads <code>Everloot-${esc(a?.latest?.version ?? "x.y.z")}.zip</code> from the site, checks it against the checksum published with the GitHub release, and replaces <code>Interface/AddOns/Everloot</code> in one swap. Close the game first, or <code>/reload</code> after.</p>
      <div class="row">
        <button type="button" class="btn btn-primary" id="installAddon" ${a?.latest && s.settings.gameFolder && !busy ? "" : "disabled"}>${busy === "install" ? "Installing…" : a?.installed ? (newer ? `Update to ${esc(a.latest!.version)}` : "Reinstall") : "Install"}</button>
        ${ext("https://everloot.app/upload", "manual install steps")}
        ${a?.addonsDir ? '<button type="button" class="link" id="openAddons">open the AddOns folder</button>' : ""}
        <span class="${flash.startsWith("!") ? "error" : "ok"} small">${esc(flash.replace(/^!/, ""))}</span>
      </div>
    </section>
    <section class="panel"><h2>In game</h2>
      <ul class="plain fg2">
        <li><code>/everloot status</code> shows what the addon is recording; <code>/everloot addons on</code> shares your addon list on the upload page only.</li>
        <li><code>/ask &lt;question&gt;</code> queues a question; this app answers it after the game writes the file.</li>
        <li>The addon only reads the game's own API and writes its own save file. It never acts for you.</li>
      </ul>
    </section>
  </div>`;
}

function changes(): string {
  const list = data.changes;
  return `<div class="page">
    <div class="head"><h1>Changes</h1><span class="sub">Blizzard posts, hotfixes and builds, newest first · ${ext("https://everloot.app/changes", "everloot.app/changes")}</span></div>
    <section class="panel"><div class="list">${list ? (list.length ? list.map((c) => `<div class="item"><div class="t">${c.link ? ext(c.link, c.title) : esc(c.title)}</div>${c.summary ? `<div class="fg2 small">${esc(c.summary)}</div>` : ""}<div class="muted small">${when(c.date)}</div></div>`).join("") : '<p class="muted">Nothing in the feed.</p>') : `<p class="muted">${data.changesError ? esc(data.changesError) : "Loading…"}</p>`}</div></section>
  </div>`;
}

function log(s: AppState): string {
  return `<div class="page">
    <div class="head"><h1>Log</h1><div class="row"><button type="button" class="btn" id="copyDiag">Copy diagnostics</button><button type="button" class="btn" id="pause">${s.engine.paused ? "Resume" : "Pause"}</button></div></div>
    ${flash ? `<p class="${flash.startsWith("!") ? "error" : "ok"} small">${esc(flash.replace(/^!/, ""))}</p>` : ""}
    <section class="panel"><div class="log">${logLines(s, 200)}</div></section>
    <p class="muted small">Copy diagnostics puts the version, your settings (where the token file is, never the token), the files watched, each job's last state and the last hundred lines on the clipboard, with your user folder hidden, for a bug report.</p>
  </div>`;
}

function settings(s: AppState): string {
  const st = s.settings;
  return `<div class="page">
    <div class="head"><h1>Settings</h1></div>
    <form id="settings" autocomplete="off">
      <section class="panel">
        <div class="field"><label for="gameFolder">Game folder <span class="hint">the product folder that holds <code>WTF</code></span></label>
          <div class="row"><input class="grow" type="text" id="gameFolder" name="gameFolder" value="${esc(st.gameFolder ?? "")}"><button type="button" class="btn" id="browse">Browse…</button></div></div>
        <div class="field"><label for="endpoint">Site <span class="hint">change only to test against another deployment</span></label><input type="url" id="endpoint" name="endpoint" value="${esc(st.endpoint)}"></div>
        ${s.platform === "linux" ? "" : `<label class="switch"><input type="checkbox" name="launchAtLogin" ${st.launchAtLogin ? "checked" : ""}> Start when I sign in</label>`}
        <label class="switch"><input type="checkbox" name="startInTray" ${st.startInTray ? "checked" : ""}> Start in the tray without a window</label>
        <div class="row"><button type="submit" class="btn btn-primary">Save</button><span class="muted" id="saved"></span></div>
      </section>
    </form>
    <section class="panel"><h2>This app</h2>
      <p class="fg2">Everloot Desktop ${esc(s.version)} · AGPL-3.0-only · ${ext("https://github.com/Everloot/everloot/tree/main/desktop", "source")} · ${ext("https://discord.gg/9CKsbHTRu3", "Discord")}</p>
      <p class="muted small">Data folder: <span class="mono">${esc(s.dataFolder)}</span> <button type="button" class="link" id="openData">open</button></p>
      <div class="row"><button type="button" class="btn" id="updates">Check for updates</button><span class="muted small" id="updateLine">${esc(flash)}</span></div>
    </section>
  </div>`;
}

function siteTool(s: AppState, id: string): string {
  const tool = s.siteTools.find((t) => t.id === id);
  if (!tool) return `<div class="site-note">Unknown tool.</div>`;
  return `<div class="site-head">
    <strong>${esc(tool.label)}</strong>
    <span class="url grow">${esc(siteUrl ?? new URL(tool.path, s.settings.endpoint).toString())}</span>
    <button type="button" class="btn" id="siteBack">Back</button>
    <button type="button" class="btn" id="siteReload">Reload</button>
    ${ext(new URL(tool.path, "https://everloot.app").toString(), "open in browser")}
  </div>
  <div class="site-note">The page below is the site itself, inside the app. Share links from the talent and raid tools work as on the web.</div>`;
}

// ---------- render and data ----------

function renderSide(s: AppState): void {
  const item = (id: string, label: string, job?: Job) => `<button type="button" data-page="${id}" ${id === page ? 'aria-current="page"' : ""}>${esc(label)}${job ? dot(s.engine.jobs[job]) : ""}</button>`;
  nav.innerHTML = PAGES.map((p) => item(p.id, p.label, p.job)).join("")
    + `<div class="section">Site tools</div>` + s.siteTools.map((t) => item(`site:${t.id}`, t.label)).join("");
  const e = s.engine;
  sideFoot.innerHTML = `<span>${e.files.length ? `Watching ${e.files.length} file(s)` : "Not watching"}${e.paused ? " · paused" : ""}</span><span>v${esc(s.version)}</span>`;
}

function render(): void {
  if (!state) return;
  const setup = !state.settings.consentedAt;
  side.hidden = setup;
  if (setup) { main.innerHTML = welcome(); return; }
  renderSide(state);
  if ((page === "settings" || page === "ask") && draftDirty) return;
  const s = state;
  if (page.startsWith("site:")) { main.innerHTML = siteTool(s, page.slice(5)); return; }
  const draft = page === "chat" ? (main.querySelector("#chatText") as HTMLTextAreaElement | null)?.value : undefined;
  main.innerHTML = page === "overview" ? overview(s) : page === "chat" ? chat() : page === "characters" ? characters() : page === "upload" ? upload(s) : page === "market" ? market(s) : page === "ask" ? ask(s)
    : page === "addon" ? addon(s) : page === "changes" ? changes() : page === "log" ? log(s) : settings(s);
  if (page === "chat") {
    const box = main.querySelector("#chatText") as HTMLTextAreaElement | null;
    if (box && draft) box.value = draft;
    const thread = main.querySelector("#thread");
    if (thread) thread.scrollTop = thread.scrollHeight;
  }
}

async function load(p: Page): Promise<void> {
  try {
    if (p === "overview") { [data.addon, data.changes] = await Promise.all([api.addonInfo(), api.changes().catch((e) => { data.changesError = msg(e); return undefined; })]); data.market = await api.marketInfo(); }
    else if (p === "chat") data.chat = await api.chatInfo();
    else if (p === "characters") data.characters = await api.charactersInfo();
    else if (p === "upload") [data.upload, data.backups] = await Promise.all([api.uploadInfo(), api.backups()]);
    else if (p === "market") data.market = await api.marketInfo();
    else if (p === "ask") data.ask = await api.askInfo();
    else if (p === "addon") data.addon = await api.addonInfo();
    else if (p === "changes") { try { data.changes = await api.changes(); data.changesError = undefined; } catch (e) { data.changesError = msg(e); } }
  } catch (e) { flash = `!${msg(e)}`; }
  if (p === page) render();
}

let reload: ReturnType<typeof setTimeout> | undefined;
api.onState((s) => {
  state = s;
  render();
  // A finished job changes what the pages show; refresh the open one once things settle.
  if (reload) clearTimeout(reload);
  reload = setTimeout(() => void load(page), 800);
});

async function detect(): Promise<void> {
  candidates = await api.detectGameFolders();
  if (!chosenFolder && candidates[0]) chosenFolder = candidates[0].folder;
  render();
}

async function go(p: Page): Promise<void> {
  if (page.startsWith("site:") && !p.startsWith("site:")) await api.siteHide();
  page = p; draftDirty = false; flash = "";
  if (p.startsWith("site:")) { siteUrl = await api.siteShow(p.slice(5)); render(); return; }
  render();
  void load(p);
}

document.body.addEventListener("click", async (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>("button");
  if (!t) return;
  if (t.dataset.page) { void go(t.dataset.page as Page); return; }
  if (t.dataset.open) { void api.openExternal(t.dataset.open); return; }
  if (t.dataset.run) { void api.runNow(t.dataset.run as Job); return; }
  if (t.dataset.unfollow) { state = await api.saveSettings({ market: { realms: state!.settings.market.realms.filter((r) => r !== t.dataset.unfollow) } }); void load("market"); return; }
  if (t.id === "pause") { await api.setPaused(!state!.engine.paused); return; }
  if (t.id === "siteBack") { void api.siteBack(); return; }
  if (t.id === "siteReload") { void api.siteReload(); return; }
  if (t.id === "chatClear") { data.chat = await api.chatClear(); render(); return; }
  if (t.id === "browse") {
    const folder = await api.pickGameFolder();
    if (!folder) return;
    if (state!.settings.consentedAt) { (main.querySelector("#gameFolder") as HTMLInputElement).value = folder; draftDirty = true; }
    else { chosenFolder = folder; render(); }
    return;
  }
  if (t.id === "pickToken") { const f = await api.pickTokenFile(); if (f) { (main.querySelector("#tokenFile") as HTMLInputElement).value = f; draftDirty = true; } return; }
  if (t.id === "redetect") { chosenFolder = null; await detect(); return; }
  if (t.id === "start" && chosenFolder) { state = await api.saveSettings({ gameFolder: chosenFolder, consentedAt: new Date().toISOString() }); void go("overview"); return; }
  if (t.id === "openConfig") { void api.openConfig(); return; }
  if (t.id === "openData") { void api.openDataFolder(); return; }
  if (t.id === "openAddons") { void api.openAddonsFolder(); return; }
  if (t.id === "realmAddBtn") {
    const input = main.querySelector("#realmAdd") as HTMLInputElement;
    const name = input.value.trim();
    if (!name) return;
    state = await api.saveSettings({ market: { realms: [...state!.settings.market.realms, name] } });
    input.value = "";
    void load("market");
    return;
  }
  if (t.id === "installAddon" && data.addon?.latest) {
    busy = "install"; flash = ""; render();
    try { const r = await api.installAddon(data.addon.latest.version); flash = `Installed ${r.version} (${r.files} files). /reload in game.`; }
    catch (e) { flash = `!${msg(e)}`; }
    busy = "";
    await load("addon");
    return;
  }
  if (t.id === "openBackups") { void api.openBackupsFolder(); return; }
  if (t.id === "removeKey") {
    try { data.chat = await api.chatRemoveKey(); flash = "Key removed. Chat is back to sourced search."; } catch (e) { flash = `!${msg(e)}`; }
    render();
    return;
  }
  if (t.id === "copyDiag" && state) {
    try { await navigator.clipboard.writeText(diagnostics(state)); flash = "Copied. Paste it into the bug report."; }
    catch (e) { flash = `!Could not copy: ${msg(e)}`; }
    render();
    return;
  }
  if (t.dataset.restore) {
    busy = t.dataset.restore; flash = ""; render();
    try { const live = await api.restoreBackup(t.dataset.restore); flash = live ? `Restored ${account(live)}. Log in to see it.` : ""; }
    catch (e) { flash = `!${msg(e)}`; }
    busy = "";
    await load("upload");
    return;
  }
  if (t.id === "updates") {
    flash = "Checking…"; render();
    try {
      const u = await api.checkForUpdates();
      flash = u.latest ? (u.newer ? `${u.latest} is available.` : `${u.current} is the newest.`) : "No desktop release yet.";
      if (u.newer && u.url) void api.openExternal(u.url);
    } catch (e) { flash = `Could not check: ${msg(e)}`; }
    render();
  }
});

main.addEventListener("change", async (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.dataset.toggle) {
    const job = el.dataset.toggle as Job;
    state = await api.saveSettings(job === "ask" ? { ask: { ...state!.settings.ask, enabled: el.checked } } : { [job]: el.checked });
    render();
    return;
  }
  if (el.dataset.realm) {
    const realm = el.dataset.realm;
    const current = state!.settings.market.realms.filter((r) => r.toLowerCase() !== realm.toLowerCase());
    state = await api.saveSettings({ market: { realms: el.checked ? [...current, realm] : current } });
    void load("market");
    return;
  }
  if (el.name === "folder") { chosenFolder = el.value; render(); return; }
  if (el.form && el.form.id !== "chatForm" && el.form.id !== "keyForm") draftDirty = true;
});
main.addEventListener("input", (ev) => { const f = (ev.target as HTMLElement).closest("form"); if (f && f.id !== "chatForm" && f.id !== "keyForm") draftDirty = true; });
main.addEventListener("keydown", (ev) => {
  if ((ev.target as HTMLElement).id === "chatText" && ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); (main.querySelector("#chatForm") as HTMLFormElement).requestSubmit(); }
});

main.addEventListener("submit", async (ev) => {
  const form = ev.target as HTMLFormElement;
  ev.preventDefault();
  const f = new FormData(form);
  const text = (k: string) => String(f.get(k) ?? "").trim();
  if (form.id === "keyForm") {
    try { data.chat = await api.chatSetKey(text("key"), text("model")); flash = `Saved. Chat now runs ${data.chat.mode}.`; }
    catch (e) { flash = `!${msg(e)}`; }
    render();
    return;
  }
  if (form.id === "chatForm") {
    const box = main.querySelector("#chatText") as HTMLTextAreaElement;
    const question = box.value.trim();
    if (!question || data.chat?.busy) return;
    box.value = "";
    data.chat = { ...(data.chat ?? { messages: [], mode: "", mcpUrl: "", withToken: false, ownKey: false, error: null }), busy: true, messages: [...(data.chat?.messages ?? []), { role: "user", text: question, at: new Date().toISOString(), model: null, sources: [], steps: [] }] };
    render();
    data.chat = await api.chatSend(question);
    render();
    return;
  }
  if (form.id === "settings") {
    state = await api.saveSettings({ gameFolder: text("gameFolder") || null, endpoint: text("endpoint"), launchAtLogin: f.get("launchAtLogin") === "on", startInTray: f.get("startInTray") === "on" });
  } else if (form.id === "askForm") {
    state = await api.saveSettings({ ask: { ...state!.settings.ask, mcpUrl: text("mcpUrl"), tokenFile: text("tokenFile") || null } });
  }
  draftDirty = false;
  render();
  const saved = main.querySelector("#saved");
  if (saved) saved.textContent = "Saved.";
});

void (async () => {
  state = await api.state();
  if (!state.settings.consentedAt) await detect();
  render();
  void load(page);
})();
