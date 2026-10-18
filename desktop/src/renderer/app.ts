import type { AppState, EverlootApi, GameFolderCandidate, Job, JobStatus } from "../shared/types";

declare global { interface Window { everloot: EverlootApi } }
const api = window.everloot;

type Screen = "welcome" | "home" | "settings";
let state: AppState | null = null;
let screen: Screen = "home";
let candidates: GameFolderCandidate[] = [];
let chosenFolder: string | null = null;
let updateLine = "";
let draftDirty = false;

const root = document.getElementById("app")!;
const nav = document.getElementById("nav")!;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

const JOB_TITLE: Record<Job, string> = { upload: "Upload", prices: "Market prices", ask: "/ask answers" };
const JOB_HELP: Record<Job, string> = {
  upload: "After every logout or /reload, sends the anonymous events the site has not confirmed.",
  prices: "Writes community market prices for your realms into the game, for tooltips after /reload.",
  ask: "Answers /ask questions from the Everloot MCP server into the game, read after /reload.",
};

function statusText(j: JobStatus): string {
  switch (j.state) {
    case "off": return "Off";
    case "idle": return "Waiting for the next write";
    case "running": return "Running";
    case "ok": return j.message || "Done";
    case "error": return j.message;
  }
}

function welcome(): string {
  const list = candidates.length
    ? `<div class="choices">${candidates.map((c) => `
        <label class="choice"><input type="radio" name="folder" value="${esc(c.folder)}" ${chosenFolder === c.folder ? "checked" : ""}>
          <span class="grow"><span class="mono">${esc(c.product)}</span> <span class="muted">${c.files ? `${c.files} account file(s) with Everloot data` : c.hasAccounts ? "no Everloot data yet" : "never played here yet"}</span><br><span class="muted mono">${esc(c.folder)}</span></span></label>`).join("")}</div>`
    : `<p class="muted">No World of Warcraft folder was found in the usual places. Browse to the folder that holds <code>WTF</code>, for example <code>World of Warcraft\\_classic_era_</code>.</p>`;
  const custom = chosenFolder && !candidates.some((c) => c.folder === chosenFolder) ? `<p class="mono fg2">${esc(chosenFolder)}</p>` : "";
  return `<div class="screen stack">
    <div>
      <h1>Set up Everloot Desktop</h1>
      <p class="fg2">It runs in the tray beside the game. After every logout it uploads what the addon recorded, keeps market prices in your tooltips and, if you turn it on, answers <code>/ask</code>.</p>
    </div>
    <section class="panel stack">
      <h2>What leaves this computer</h2>
      <ul class="plain fg2">
        <li>Anonymous observations from <code>Everloot.lua</code>: drops, vendors, recipes, spawns, auction scans. No character or account name.</li>
        <li>Nothing else. Named data (guild, gear, gold, collection) and your installed addon list stay here; share those on the website if you want to.</li>
      </ul>
      <p class="notice">Uploaded observations are published under CC BY-SA 4.0, credited to Everloot contributors.<br>Source: <button type="button" class="btn-link" data-open="https://github.com/Everloot/everloot">github.com/Everloot/everloot</button> · Rules: <button type="button" class="btn-link" data-open="https://everloot.app/privacy">everloot.app/privacy</button></p>
    </section>
    <section class="panel stack">
      <h2>Which game folder?</h2>
      ${list}${custom}
      <div class="row"><button type="button" class="btn btn-sm" id="browse">Browse…</button><button type="button" class="btn btn-sm" id="redetect">Look again</button></div>
    </section>
    <div class="row">
      <button type="button" class="btn btn-primary" id="start" ${chosenFolder ? "" : "disabled"}>Start</button>
      <span class="muted">Nothing runs before you press Start.</span>
    </div>
  </div>`;
}

function home(s: AppState): string {
  const e = s.engine;
  const watching = e.files.length
    ? `Watching ${e.files.length} account file(s) in <span class="mono">${esc(s.settings.gameFolder ?? "")}</span>${e.paused ? " · <strong>paused</strong>" : ""}`
    : `Not watching anything yet. ${s.settings.gameFolder ? "Log out once in the game so it writes <code>Everloot.lua</code>." : "Pick the game folder in Settings."}`;
  const cards = (["upload", "prices", "ask"] as Job[]).map((job) => {
    const j = e.jobs[job];
    const on = job === "ask" ? s.settings.ask.enabled : s.settings[job];
    return `<section class="panel card">
      <div class="card-head"><h2><span class="status status-${j.state}"></span>${JOB_TITLE[job]}</h2>
        <label class="switch"><input type="checkbox" data-toggle="${job}" ${on ? "checked" : ""}><span class="muted">${on ? "On" : "Off"}</span></label></div>
      <div class="card-body ${j.state === "error" ? "error" : ""}">${on ? esc(statusText(j)) : esc(JOB_HELP[job])}</div>
      <div class="card-foot"><span class="muted">${when(j.at)}</span>
        <button type="button" class="btn btn-sm" data-run="${job}" ${on && e.files.length && !e.paused && j.state !== "running" ? "" : "disabled"}>Run now</button></div>
    </section>`;
  }).join("");
  const log = e.log.slice().reverse().map((l) => `<div><time>${when(l.at)}</time><span class="${l.level}">${esc(l.text)}</span></div>`).join("");
  return `<div class="screen stack">
    ${s.notice ? `<p class="error">${esc(s.notice)}</p>` : ""}
    <p class="fg2">${watching}</p>
    <div class="cards">${cards}</div>
    <section class="panel">
      <div class="row" style="justify-content:space-between"><h2>Log</h2><button type="button" class="btn btn-sm" id="pause">${e.paused ? "Resume" : "Pause"}</button></div>
      <div class="log">${log || '<span class="muted">Nothing yet.</span>'}</div>
    </section>
  </div>`;
}

function settings(s: AppState): string {
  const st = s.settings;
  return `<div class="screen stack">
    <h1>Settings</h1>
    <form id="settings" class="stack" autocomplete="off">
      <section class="panel stack">
        <div class="field"><label for="gameFolder">Game folder <span class="hint">The product folder that holds <code>WTF</code>.</span></label>
          <div class="row"><input class="grow" type="text" id="gameFolder" name="gameFolder" value="${esc(st.gameFolder ?? "")}"><button type="button" class="btn btn-sm" id="browse">Browse…</button></div></div>
        <div class="field"><label for="endpoint">Site <span class="hint">Change only to test against another deployment.</span></label>
          <input type="url" id="endpoint" name="endpoint" value="${esc(st.endpoint)}"></div>
      </section>
      <section class="panel stack">
        <h2>/ask answers</h2>
        <label class="switch"><input type="checkbox" name="askEnabled" ${st.ask.enabled ? "checked" : ""}> Answer /ask questions</label>
        <div class="field"><label for="mcpUrl">MCP server</label><input type="url" id="mcpUrl" name="mcpUrl" value="${esc(st.ask.mcpUrl)}"></div>
        <div class="field"><label for="tokenFile">Token file <span class="hint">A file holding your key from <button type="button" class="btn-link" data-open="https://everloot.app/connect">everloot.app/connect</button>. The app reads the file; the key is never typed here.</span></label>
          <div class="row"><input class="grow" type="text" id="tokenFile" name="tokenFile" value="${esc(st.ask.tokenFile ?? "")}"><button type="button" class="btn btn-sm" id="pickToken">Choose…</button></div></div>
        <p class="muted">Optional model providers go in <code>config.json</code> in the data folder, as for the command line. <button type="button" class="btn-link" id="openConfig">Open config.json</button></p>
      </section>
      <section class="panel stack">
        <h2>This computer</h2>
        ${s.platform === "linux" ? "" : `<label class="switch"><input type="checkbox" name="launchAtLogin" ${st.launchAtLogin ? "checked" : ""}> Start when I sign in</label>`}
        <label class="switch"><input type="checkbox" name="startInTray" ${st.startInTray ? "checked" : ""}> Start in the tray without a window</label>
        <p class="muted">Data folder: <span class="mono">${esc(s.dataFolder)}</span> <button type="button" class="btn-link" id="openData">Open</button></p>
      </section>
      <div class="row"><button type="submit" class="btn btn-primary">Save</button><span class="muted" id="saved"></span></div>
    </form>
    <section class="panel stack">
      <h2>About</h2>
      <p class="fg2">Everloot Desktop ${esc(s.version)} · AGPL-3.0-only · <button type="button" class="btn-link" data-open="https://github.com/Everloot/everloot/tree/main/desktop">source</button> · <button type="button" class="btn-link" data-open="https://discord.gg/9CKsbHTRu3">Discord</button></p>
      <div class="row"><button type="button" class="btn btn-sm" id="updates">Check for updates</button><span class="muted" id="updateLine">${esc(updateLine)}</span></div>
    </section>
  </div>`;
}

function render(): void {
  if (!state) return;
  const current: Screen = state.settings.consentedAt ? screen : "welcome";
  nav.hidden = current === "welcome";
  for (const b of nav.querySelectorAll<HTMLButtonElement>("[data-screen]")) {
    if (b.dataset.screen === current) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  }
  // A settings form being edited is not redrawn under the player's hands.
  if (current === "settings" && draftDirty) return;
  root.innerHTML = current === "welcome" ? welcome() : current === "home" ? home(state) : settings(state);
}

async function detect(): Promise<void> {
  candidates = await api.detectGameFolders();
  if (!chosenFolder && candidates[0]) chosenFolder = candidates[0].folder;
  render();
}

root.addEventListener("click", async (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>("button, label");
  if (!t) return;
  const open = t.dataset.open;
  if (open) { void api.openExternal(open); return; }
  if (t.dataset.run) { void api.runNow(t.dataset.run as Job); return; }
  if (t.id === "pause") { await api.setPaused(!state!.engine.paused); return; }
  if (t.id === "browse") {
    const folder = await api.pickGameFolder();
    if (!folder) return;
    if (state!.settings.consentedAt) { (root.querySelector("#gameFolder") as HTMLInputElement).value = folder; draftDirty = true; }
    else { chosenFolder = folder; render(); }
    return;
  }
  if (t.id === "pickToken") { const f = await api.pickTokenFile(); if (f) { (root.querySelector("#tokenFile") as HTMLInputElement).value = f; draftDirty = true; } return; }
  if (t.id === "redetect") { chosenFolder = null; await detect(); return; }
  if (t.id === "start" && chosenFolder) { state = await api.saveSettings({ gameFolder: chosenFolder, consentedAt: new Date().toISOString() }); screen = "home"; render(); return; }
  if (t.id === "openConfig") { void api.openConfig(); return; }
  if (t.id === "openData") { void api.openDataFolder(); return; }
  if (t.id === "updates") {
    updateLine = "Checking…"; render();
    try {
      const u = await api.checkForUpdates();
      updateLine = u.latest ? (u.newer ? `${u.latest} is available.` : `${u.current} is the newest.`) : "No desktop release yet.";
      if (u.newer && u.url) void api.openExternal(u.url);
    } catch (err) { updateLine = `Could not check: ${err instanceof Error ? err.message : String(err)}`; }
    render();
  }
});

root.addEventListener("change", async (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.dataset.toggle) {
    const job = el.dataset.toggle as Job;
    state = await api.saveSettings(job === "ask" ? { ask: { ...state!.settings.ask, enabled: el.checked } } : { [job]: el.checked });
    render();
    return;
  }
  if (el.name === "folder") { chosenFolder = el.value; render(); return; }
  if (el.form?.id === "settings") draftDirty = true;
});

root.addEventListener("input", (ev) => { if ((ev.target as HTMLElement).closest("#settings")) draftDirty = true; });

root.addEventListener("submit", async (ev) => {
  const form = ev.target as HTMLFormElement;
  if (form.id !== "settings") return;
  ev.preventDefault();
  const f = new FormData(form);
  const text = (k: string) => String(f.get(k) ?? "").trim();
  state = await api.saveSettings({
    gameFolder: text("gameFolder") || null,
    endpoint: text("endpoint"),
    ask: { enabled: f.get("askEnabled") === "on", mcpUrl: text("mcpUrl"), tokenFile: text("tokenFile") || null },
    launchAtLogin: f.get("launchAtLogin") === "on",
    startInTray: f.get("startInTray") === "on",
  });
  draftDirty = false;
  render();
  const saved = root.querySelector("#saved");
  if (saved) saved.textContent = "Saved.";
});

nav.addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("[data-screen]");
  if (!b) return;
  screen = b.dataset.screen as Screen;
  draftDirty = false;
  render();
});

api.onState((s) => { state = s; render(); });
void (async () => {
  state = await api.state();
  if (!state.settings.consentedAt) await detect();
  render();
})();
