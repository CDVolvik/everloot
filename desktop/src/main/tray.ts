import { Menu, Tray, nativeImage } from "electron";
import type { AppState, Job } from "../shared/types";
import { scanReminder } from "./inspect";

export interface TrayActions {
  show(): void;
  runNow(job: Job): void;
  setPaused(paused: boolean): void;
  openExternal(url: string): void;
  quit(): void;
}

const LABEL: Record<Job, string> = { upload: "Upload", prices: "Market prices", ask: "/ask" };

/** One line per job for the tray menu: "Upload: sent 3 new events (02:41)". */
export function jobLine(state: AppState, job: Job): string {
  const j = state.engine.jobs[job];
  const when = j.at ? ` (${new Date(j.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : "";
  switch (j.state) {
    case "off": return `${LABEL[job]}: off`;
    case "idle": return `${LABEL[job]}: waiting`;
    case "running": return `${LABEL[job]}: running`;
    case "ok": return `${LABEL[job]}: ${j.message.split(";")[0]}${when}`;
    case "error": return `${LABEL[job]}: failed, ${j.message}${when}`;
  }
}

export function createTray(iconPath: string, actions: TrayActions): { update(state: AppState): void; destroy(): void } {
  const tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip("Everloot Desktop");
  tray.on("click", () => actions.show());
  tray.on("double-click", () => actions.show());
  return {
    update(state) {
      const paused = state.engine.paused;
      const watching = state.engine.files.length;
      const reminder = scanReminder(state.staleScans);
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: watching ? `Watching ${watching} account file(s)` : "Not watching a game folder", enabled: false },
        { label: jobLine(state, "upload"), enabled: false },
        { label: jobLine(state, "prices"), enabled: false },
        { label: jobLine(state, "ask"), enabled: false },
        ...(reminder ? [{ label: reminder, click: () => actions.show() }] : []),
        ...(state.update?.newer && state.update.url ? [{ label: `Update Everloot Desktop to ${state.update.latest}`, click: () => actions.openExternal(state.update!.url!) }] : []),
        { type: "separator" as const },
        { label: "Open Everloot Desktop", click: () => actions.show() },
        { label: "Upload now", enabled: state.settings.upload && watching > 0 && !paused, click: () => actions.runNow("upload") },
        { label: "Refresh prices now", enabled: state.settings.prices && watching > 0 && !paused, click: () => actions.runNow("prices") },
        { label: paused ? "Resume" : "Pause", click: () => actions.setPaused(!paused) },
        { type: "separator" },
        { label: "Quit", click: () => actions.quit() },
      ]));
      tray.setToolTip(paused ? "Everloot Desktop (paused)" : "Everloot Desktop");
    },
    destroy: () => tray.destroy(),
  };
}
