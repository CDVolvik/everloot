import { afterEach, expect, test, vi } from "vitest";
import { battlenetProvider, battlenetUser, isPlaceholderEmail, placeholderEmail } from "./battlenet";

afterEach(() => vi.unstubAllGlobals());

test("placeholder emails are reserved-domain and recognised in any case", () => {
  expect(placeholderEmail("123")).toBe("bnet-123@users.everloot.invalid");
  expect(isPlaceholderEmail("BNET-123@Users.Everloot.Invalid")).toBe(true);
  expect(isPlaceholderEmail("someone@everloot.app")).toBe(false);
});

test("a Battle.net profile maps to a user with the BattleTag as name and an unverified placeholder", () => {
  expect(battlenetUser({ sub: "123", battletag: "Thrall#1" }))
    .toEqual({ id: "123", name: "Thrall#1", email: "bnet-123@users.everloot.invalid", emailVerified: false });
  expect(battlenetUser({ id: 456, battletag: "Jaina#2" })?.id).toBe("456");
});

test("a profile without a numeric id or a BattleTag is refused", () => {
  expect(battlenetUser({ sub: "abc", battletag: "X#1" })).toBeNull();
  expect(battlenetUser({ sub: "123" })).toBeNull();
});

test("the provider fetches userinfo with the access token and maps the profile", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ sub: "123", battletag: "Thrall#1" })))
    .mockResolvedValueOnce(new Response("nope", { status: 401 }));
  vi.stubGlobal("fetch", fetchMock);
  const provider = battlenetProvider({ BNET_CLIENT_ID: " id ", BNET_CLIENT_SECRET: " secret " });
  expect(provider.clientId).toBe("id");
  expect(provider.clientSecret).toBe("secret");
  const tokens = { accessToken: "tok" };
  expect(await provider.getUserInfo?.(tokens)).toEqual({
    id: "123", name: "Thrall#1", email: "bnet-123@users.everloot.invalid", emailVerified: false,
  });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://oauth.battle.net/userinfo");
  expect(init.headers.Authorization).toBe("Bearer tok");
  expect(await provider.getUserInfo?.(tokens)).toBeNull();
});
