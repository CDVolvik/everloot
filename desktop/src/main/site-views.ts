import { BrowserWindow, WebContentsView, app, shell } from "electron";
import { allowedExternal } from "./external";

/** The site pages the app shows inside its own window, under the sidebar. Paths only; the host is the configured site. */
export const SITE_TOOLS: { id: string; label: string; path: string }[] = [
  { id: "talents", label: "Talent calculator", path: "/tools/talents" },
  { id: "raid", label: "Raid builder", path: "/tools/raid" },
  { id: "database", label: "Database", path: "/database" },
  { id: "auctions", label: "Auction prices", path: "/tools/auctions" },
  { id: "map", label: "World map", path: "/map" },
  { id: "lore", label: "Lore archive", path: "/lore" },
];

/** Where the embedded page sits: right of the sidebar, under the page header. The stylesheet uses the same numbers. */
export const LAYOUT = { sidebar: 184, header: 44 };

export function siteToolPath(id: string): string | null {
  return SITE_TOOLS.find((t) => t.id === id)?.path ?? null;
}

/**
 * One embedded browser view for the site's tools (talents, raid builder, database, map...). The
 * view stays on the configured site: a link elsewhere opens in the system browser instead. It has
 * no preload and no Node, so the page is just the public site, inside the app's frame. The view's
 * user agent carries an `EverlootDesktopApp/<version>` token so the site can tell it is inside the
 * app and leave its ad units out (AdSense does not allow ads inside a desktop application).
 * Electron's default user agent already holds the product name without spaces, so this only adds
 * the token when a rename has taken it away.
 */
export const USER_AGENT_TOKEN = "EverlootDesktopApp";

export function appUserAgent(base: string, version: string): string {
  return base.includes(`${USER_AGENT_TOKEN}/`) ? base : `${base} ${USER_AGENT_TOKEN}/${version}`;
}

export function createSiteViews(win: BrowserWindow, endpoint: () => string) {
  let view: WebContentsView | null = null;
  let shown = false;

  const sameSite = (url: string) => { try { return new URL(url).origin === new URL(endpoint()).origin; } catch { return false; } };

  const layout = () => {
    if (!view || !shown) return;
    const [w, h] = win.getContentSize();
    view.setBounds({ x: LAYOUT.sidebar, y: LAYOUT.header, width: Math.max(0, w - LAYOUT.sidebar), height: Math.max(0, h - LAYOUT.header) });
  };
  win.on("resize", layout);

  const ensure = () => {
    if (view) return view;
    view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    view.webContents.setUserAgent(appUserAgent(view.webContents.getUserAgent(), app.getVersion()));
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (sameSite(url)) void view?.webContents.loadURL(url);
      else if (allowedExternal(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    view.webContents.on("will-navigate", (e, url) => {
      if (sameSite(url)) return;
      e.preventDefault();
      if (allowedExternal(url)) void shell.openExternal(url);
    });
    return view;
  };

  return {
    show(path: string): string {
      const url = new URL(path, endpoint()).toString();
      const v = ensure();
      if (!shown) { win.contentView.addChildView(v); shown = true; }
      layout();
      if (v.webContents.getURL() !== url) void v.webContents.loadURL(url);
      return url;
    },
    hide(): void {
      if (view && shown) { win.contentView.removeChildView(view); shown = false; }
    },
    back(): void { if (view?.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack(); },
    reload(): void { view?.webContents.reload(); },
    currentUrl: () => view?.webContents.getURL() ?? null,
    destroy(): void {
      // On quit the window is already destroyed when "closed" fires; touching its views then throws.
      if (!win.isDestroyed()) this.hide(); else shown = false;
      if (view && !view.webContents.isDestroyed()) view.webContents.close();
      view = null;
    },
  };
}
