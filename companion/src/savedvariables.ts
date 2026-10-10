import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Every account's Everloot.lua under a game folder: WTF/Account/<ACCOUNT>/SavedVariables/Everloot.lua. */
export function findEverlootFiles(gameFolder: string): string[] {
  const accounts = join(gameFolder, "WTF", "Account");
  if (!existsSync(accounts)) return [];
  return readdirSync(accounts)
    .map((name) => join(accounts, name, "SavedVariables", "Everloot.lua"))
    .filter((file) => existsSync(file) && statSync(file).isFile());
}
