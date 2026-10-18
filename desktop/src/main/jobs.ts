import { readFileSync, watch as fsWatch } from "node:fs";
import { dirname, join } from "node:path";
import { answerPending, createAnswerStore } from "../../../companion/src/bridge/run";
import { mcpEngine, mcpSearch } from "../../../companion/src/bridge/engine";
import { llmEngine } from "../../../companion/src/bridge/llm-engine";
import { loadProviders } from "../../../companion/src/providers/config";
import { findEverlootFiles } from "../../../companion/src/savedvariables";
import { createSentState } from "../../../companion/src/sent-state";
import { refreshPrices } from "../../../companion/src/prices";
import { uploadFile } from "../../../companion/src/uploader";
import type { Settings } from "../shared/types";
import type { EngineDeps } from "./engine";

/**
 * The engine's jobs, built on the companion's own functions so the app sends and writes exactly
 * what the command line does. `current` is read on every run, so a settings change takes effect
 * at the next job without rebuilding anything.
 */
export function companionJobs(dataFolder: string, current: () => Settings): EngineDeps {
  const state = createSentState(join(dataFolder, "sent.json"));
  const store = createAnswerStore(join(dataFolder, "answers.json"));
  const addonsDir = () => join(current().gameFolder ?? "", "Interface", "AddOns");
  return {
    findFiles: findEverlootFiles,
    async upload(file) {
      const r = await uploadFile(file, { endpoint: current().endpoint, state });
      return `sent ${r.sent} new events in ${r.batches} batch(es); kept ${r.heldNamed} named, ${r.heldAddons} installed-addon and ${r.heldLegacy} legacy rows here`;
    },
    async prices(files) {
      const r = await refreshPrices({ svFiles: files, addonsDir: addonsDir(), endpoint: current().endpoint });
      return `${r.items} items on ${r.realms} realm(s) written; /reload in game to see them`;
    },
    async ask(file) {
      const s = current();
      if (!s.ask.tokenFile) throw new Error("/ask needs a token file (Settings)");
      let token: string;
      try { token = readFileSync(s.ask.tokenFile, "utf8").trim(); }
      catch { throw new Error(`token file ${s.ask.tokenFile} could not be read`); }
      if (!token) throw new Error(`token file ${s.ask.tokenFile} is empty`);
      const mcp = { url: s.ask.mcpUrl, token };
      // Providers the player enabled in config.json beside sent.json; none means plain search answers.
      const providers = loadProviders(join(dirname(join(dataFolder, "sent.json")), "config.json"));
      const engine = providers.length ? llmEngine({ search: (q) => mcpSearch(mcp, q, 3), providers }) : mcpEngine(mcp);
      const r = await answerPending({ svFile: file, addonsDir: addonsDir(), engine, store });
      const how = providers.length ? providers.map((p) => p.name).join(" > ") : "plain search";
      return r.answered || r.failed ? `answered ${r.answered}, failed ${r.failed} (${how}); /reload in game to read them` : `nothing pending (${how})`;
    },
    watch(file, onChange) {
      const w = fsWatch(file, onChange);
      return () => w.close();
    },
  };
}
