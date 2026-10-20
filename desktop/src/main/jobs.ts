import { readFileSync, watch as fsWatch } from "node:fs";
import { join } from "node:path";
import { answerPending, createAnswerStore } from "../../../companion/src/bridge/run";
import { mcpEngine, mcpSearch } from "../../../companion/src/bridge/engine";
import { llmEngine } from "../../../companion/src/bridge/llm-engine";
import { loadProviders } from "../../../companion/src/providers/config";
import { findEverlootFiles } from "../../../companion/src/savedvariables";
import { createSentState } from "../../../companion/src/sent-state";
import { uploadFile } from "../../../companion/src/uploader";
import type { RealmSummary, Settings } from "../shared/types";
import { backupSavedVariables } from "./backups";
import type { EngineDeps } from "./engine";
import { refreshMarket } from "./market";

/**
 * The engine's jobs, built on the companion's own functions so the app sends and writes exactly
 * what the command line does. `current` is read on every run, so a settings change takes effect
 * at the next job without rebuilding anything.
 */
export function companionJobs(dataFolder: string, current: () => Settings): { deps: EngineDeps; lastMarket(): RealmSummary[]; answerStore: ReturnType<typeof createAnswerStore> } {
  const state = createSentState(join(dataFolder, "sent.json"));
  const answerStore = createAnswerStore(join(dataFolder, "answers.json"));
  const addonsDir = () => join(current().gameFolder ?? "", "Interface", "AddOns");
  let lastMarket: RealmSummary[] = [];
  const deps: EngineDeps = {
    findFiles: findEverlootFiles,
    async upload(file) {
      const r = await uploadFile(file, { endpoint: current().endpoint, state });
      // A copy of the file as it was uploaded; a failed backup never fails the upload.
      let backup = "";
      try { backupSavedVariables(file, dataFolder); backup = "; backup kept"; } catch (err) { backup = `; backup failed: ${err instanceof Error ? err.message : String(err)}`; }
      return `sent ${r.sent} new events in ${r.batches} batch(es); kept ${r.heldNamed} named, ${r.heldAddons} installed-addon and ${r.heldLegacy} legacy rows here${backup}`;
    },
    async prices(files) {
      const s = current();
      const r = await refreshMarket({ svFiles: files, followed: s.market.realms, addonsDir: addonsDir(), endpoint: s.endpoint });
      lastMarket = r.realms;
      return `${r.items} items on ${r.realms.length} realm(s) written; /reload in game to see them`;
    },
    async ask(file) {
      const s = current();
      if (!s.ask.tokenFile) throw new Error("/ask needs a token file (Ask page)");
      let token: string;
      try { token = readFileSync(s.ask.tokenFile, "utf8").trim(); }
      catch { throw new Error(`token file ${s.ask.tokenFile} could not be read`); }
      if (!token) throw new Error(`token file ${s.ask.tokenFile} is empty`);
      const mcp = { url: s.ask.mcpUrl, token };
      // Providers the player enabled in config.json beside sent.json; none means plain search answers.
      const providers = loadProviders(join(dataFolder, "config.json"));
      const engine = providers.length ? llmEngine({ search: (q) => mcpSearch(mcp, q, 3), providers }) : mcpEngine(mcp);
      const r = await answerPending({ svFile: file, addonsDir: addonsDir(), engine, store: answerStore });
      const how = providers.length ? providers.map((p) => p.name).join(" > ") : "plain search";
      return r.answered || r.failed ? `answered ${r.answered}, failed ${r.failed} (${how}); /reload in game to read them` : `nothing pending (${how})`;
    },
    watch(file, onChange) {
      // fs.watch emits "error" when the folder vanishes (drive unplugged, WTF moved); with no listener
      // that is an uncaught exception. Close and try again every few seconds until stopped.
      let w: ReturnType<typeof fsWatch> | null = null;
      let stopped = false;
      let retry: ReturnType<typeof setTimeout> | null = null;
      const arm = () => {
        if (stopped) return;
        // The game saves by moving the old file aside and writing a new one. On Linux and macOS a watch
        // follows the moved file, so after a rename it is armed again on the new one.
        try {
          w = fsWatch(file, (event) => {
            onChange();
            if (event === "rename") { w?.close(); w = null; if (retry) clearTimeout(retry); retry = setTimeout(arm, 500); }
          });
        } catch { retry = setTimeout(arm, 5000); return; }
        w.on("error", () => { w?.close(); w = null; retry = setTimeout(arm, 5000); });
      };
      arm();
      return () => { stopped = true; if (retry) clearTimeout(retry); w?.close(); w = null; };
    },
  };
  return { deps, lastMarket: () => lastMarket, answerStore };
}
