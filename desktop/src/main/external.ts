/** The page may open a browser only to these hosts, and only over https. */
export const EXTERNAL_HOSTS = ["everloot.app", "github.com", "www.github.com", "discord.gg"];

export function allowedExternal(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  return u.protocol === "https:" && EXTERNAL_HOSTS.includes(u.hostname);
}
