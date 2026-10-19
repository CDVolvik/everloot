import { expect, test } from "vitest";
import { accountOf } from "../src/main/engine";

test("log lines name the account, not the whole path, on either slash", () => {
  expect(accountOf("C:\\Games\\WoW\\_classic_era_\\WTF\\Account\\MYACC\\SavedVariables\\Everloot.lua")).toBe("MYACC");
  expect(accountOf("/home/p/wow/_classic_era_/WTF/Account/MYACC/SavedVariables/Everloot.lua")).toBe("MYACC");
  expect(accountOf("somewhere/else.lua")).toBe("somewhere/else.lua");
});
