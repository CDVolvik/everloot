import { expect, test } from "vitest";
import { validateClaimToken } from "./guild-authority";

test("a token-shaped string is not proof of officer authority", () => {
  expect(validateClaimToken(`evt_${"a".repeat(40)}`, { guildName: "Guild", realm: "Realm" }).valid).toBe(false);
});
