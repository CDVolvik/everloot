import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import PrivacyPage from "./page";

const text = renderToStaticMarkup(<PrivacyPage />).replace(/<[^>]+>/g, "").replaceAll("&#x27;", "'").replace(/\s+/g, " ");
const policy = readFileSync(new URL("../../../../docs/DATA_POLICY.md", import.meta.url), "utf8").replace(/\s+/g, " ");

test("the census paragraph says it is opt-in, what is kept, what is never read and when counts show", () => {
  for (const claim of [
    "/everloot census on",
    "race, class, level and faction for your own characters, with the realm name",
    "players you target, mouse over or group with",
    "never reads another player's name, guild, gear or position",
    "keyed one-way hash",
    "number of the server",
    "never published one by one",
    "at least 10 characters reported by at least 3 installs",
  ]) expect(text).toContain(claim);
});

test("the retention list says how long census rows are kept", () => {
  expect(text).toContain("Census rows: as long as the upload they came in, and removed with it.");
});

test("the data policy says the same about the census", () => {
  for (const claim of [
    "off until `/everloot census on`",
    "never their name, guild, gear or position",
    "HMAC-SHA256",
    "keeps the server id",
    "census rows are dropped and nothing from them is stored",
    "never published row by row",
    "at least 10 characters reported by at least 3 installs",
  ]) expect(policy).toContain(claim);
});
