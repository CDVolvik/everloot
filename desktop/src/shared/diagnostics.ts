import type { AppState } from "./types";

/** `C:\Users\name`, `/Users/name` and `/home/name` become `~`, so a pasted report does not carry the account name. */
export const hideHome = (text: string) => text.replace(/([A-Za-z]:\\Users\\|\/Users\/|\/home\/)[^\\/\n"']+/g, "~");

/**
 * The text behind "Copy diagnostics" on the Log page: version, platform, settings (never the token,
 * only where the token file is), the files watched, each job's last state and the last hundred log
 * lines. Everything in it is already on screen somewhere; this puts it in one paste for a bug report.
 */
export function diagnostics(s: AppState, lines = 100, now = new Date()): string {
  const st = s.settings;
  const job = (name: "upload" | "prices" | "ask") => { const j = s.engine.jobs[name]; return `${name}: ${j.state}${j.message ? `, ${j.message}` : ""}${j.at ? ` (${j.at})` : ""}`; };
  const out = [
    `Everloot Desktop App ${s.version} on ${s.platform}, ${now.toISOString()}`,
    `data folder: ${s.dataFolder}`,
    `game folder: ${st.gameFolder ?? "(none)"}`,
    `endpoint: ${st.endpoint}`,
    `upload: ${st.upload}, census: ${st.census}, prices: ${st.prices}, ask: ${st.ask.enabled} (mcp ${st.ask.mcpUrl}, token file ${st.ask.tokenFile ?? "(none)"})`,
    `account: ${s.account.signedIn ? "signed in with an everloot.app key" : "signed out"}`,
    `market realms: ${st.market.realms.join(", ") || "(none)"}`,
    `launch at login: ${st.launchAtLogin}, start in tray: ${st.startInTray}, consented: ${st.consentedAt ?? "no"}`,
    `update: ${s.update ? `${s.update.latest ?? "none"}${s.update.newer ? " (newer)" : ""}` : "not checked"}`,
    `watching ${s.engine.files.length} file(s)${s.engine.paused ? ", paused" : ""}:`,
    ...s.engine.files.map((f) => `  ${f}`),
    job("upload"), job("prices"), job("ask"),
    s.notice ? `settings notice: ${s.notice}` : "",
    "",
    `log (last ${Math.min(lines, s.engine.log.length)} of ${s.engine.log.length}):`,
    ...s.engine.log.slice(-lines).map((l) => `${l.at} ${l.level === "error" ? "ERROR " : ""}${l.text}`),
  ];
  return hideHome(out.filter((l) => l !== "").join("\n")) + "\n";
}
