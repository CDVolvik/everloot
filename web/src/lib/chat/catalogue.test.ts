import { expect, test, vi } from "vitest";
import { CATALOGUE, catalogueProvider, inkOn, listModels, priceNote } from "./catalogue";
import { CHAT_PROVIDERS, MODEL_ID } from "./providers";

const contrast = (hex: string, ink: string) => {
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(hex), lum(ink)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

test("every provider is a row of data and every model a line the pickers accept", () => {
  const kinds = CATALOGUE.map((p) => p.kind);
  expect(new Set(kinds).size).toBe(kinds.length);
  for (const p of CATALOGUE) {
    expect(p.colour).toMatch(/^#[0-9A-F]{6}$/i);
    expect(p.mark).toMatch(/^[A-Za-z]{1,2}$/);
    expect(contrast(p.colour, inkOn(p.colour))).toBeGreaterThanOrEqual(4.5);
    expect(p.baseUrl).toMatch(/^https?:\/\/\S+[^/]$/);
    expect(p.getKey.href).toMatch(/^https:\/\//);
    const ids = p.models.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of p.models) { expect(m.id).toMatch(MODEL_ID); expect(m.label).not.toBe(""); expect(m.note).not.toBe(""); }
  }
  expect(catalogueProvider("nope")).toBeNull();
});

test("the website offers only the providers that answered the browser's CORS check", () => {
  expect(CHAT_PROVIDERS.map((p) => p.kind)).toEqual(CATALOGUE.filter((p) => p.browser).map((p) => p.kind));
  for (const kind of ["zai", "tencent", "byteplus", "stepfun", "internlm", "opencode", "cerebras"]) expect(CHAT_PROVIDERS.some((p) => p.kind === kind)).toBe(false);
  // OpenRouter's attribution header goes to OpenRouter alone; it fails the CORS check elsewhere.
  expect(CHAT_PROVIDERS.filter((p) => "x-title" in p.headers).map((p) => p.kind)).toEqual(["openrouter"]);
});

test("prices read as the picker shows them", () => {
  expect(priceNote(0, 0)).toBe("free");
  expect(priceNote(0.024, 0.375)).toBe("$0.024 / $0.38");
  expect(priceNote(0.0000001 * 1e6, 15)).toBe("$0.10 / $15");
  expect(priceNote(0.3, 2.5)).toBe("$0.30 / $2.50");
});

const json = (body: unknown, status = 200) => Response.json(body, { status });

test("OpenRouter's public list: the catalogue's lines first at today's price, then every other cheap tool-calling model", async () => {
  const send = vi.fn(async (_url: string) => json({ data: [
    { id: "newlab/cheap-1", name: "NewLab: Cheap 1", pricing: { prompt: "0.0000001", completion: "0.0000002" }, supported_parameters: ["tools"] },
    { id: "qwen/qwen3.7-flash", pricing: { prompt: "0.00000003", completion: "0.00000013" }, supported_parameters: ["tools"] },
    { id: "nvidia/nemotron-3.5-lightning:free", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
    { id: "dear/model", pricing: { prompt: "0.00001", completion: "0.00003" }, supported_parameters: ["tools"] },
    { id: "some/router", pricing: { prompt: "-1", completion: "-1" }, supported_parameters: ["tools"] },
    { id: "chat/only", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["temperature"] },
    { id: "newlab/cheap-1:batch", pricing: { prompt: "0.00000005", completion: "0.0000001" }, supported_parameters: ["tools"] },
    { id: "typesafe/jev-router", pricing: { prompt: "-1", completion: "-1" }, supported_parameters: ["tools"] },
  ] }));
  const models = await listModels(catalogueProvider("openrouter")!, "", send as never);
  expect(send.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/models");
  expect(models).toEqual([
    { id: "qwen/qwen3.7-flash", label: "Qwen 3.7 Flash", note: "$0.03 / $0.13" },
    { id: "nvidia/nemotron-3.5-lightning:free", label: "Nemotron 3.5 Lightning (free)", note: "free, 50 requests a day until you buy $10 of credits" },
    // A router has no fixed price; the catalogue's line says so.
    { id: "typesafe/jev-router", label: "TypeSafe Jev Router", note: "price set per request [?]" },
    { id: "newlab/cheap-1", label: "NewLab: Cheap 1", note: "$0.10 / $0.20" },
  ]);
});

test("a keyed provider lists what the key may use; without a key, or when it fails, the catalogue stands", async () => {
  const deepseek = catalogueProvider("deepseek")!;
  const send = vi.fn(async (_url: string, _init?: RequestInit) => json({ data: [{ id: "deepseek-flash" }, { id: "deepseek-v4-pro" }, { id: "text-embedding-x" }] }));
  expect(await listModels(deepseek, "sk-test", send as never)).toEqual([
    { id: "deepseek-flash", label: "DeepSeek V4.1 Flash", note: "$0.15 / $0.60 off-peak, $0.30 / $1.20 at peak" },
    { id: "deepseek-v4-pro", label: "deepseek-v4-pro", note: "" },
  ]);
  expect(send.mock.calls[0][0]).toBe("https://api.deepseek.com/models");
  expect(send.mock.calls[0][1]?.headers).toEqual({ authorization: "Bearer sk-test" });
  expect(await listModels(deepseek, "sk-test", (async () => json({ error: "no" }, 401)) as never)).toBeNull();
  expect(await listModels(deepseek, "sk-test", (async () => { throw new TypeError("Failed to fetch"); }) as never)).toBeNull();
});

test("Anthropic lists with the key's headers; Ollama lists what was pulled", async () => {
  const ant = vi.fn(async (_url: string, _init?: RequestInit) => json({ data: [{ id: "claude-haiku-5-5", display_name: "Claude Haiku 5.5" }, { id: "claude-new", display_name: "Claude New" }] }));
  expect(await listModels(catalogueProvider("anthropic")!, "sk-ant-x", ant as never)).toEqual([
    { id: "claude-haiku-5-5", label: "Haiku 5.5", note: "$1 / $5, fast" },
    { id: "claude-new", label: "Claude New", note: "" },
  ]);
  expect(ant.mock.calls[0][1]?.headers).toMatchObject({ "x-api-key": "sk-ant-x", "anthropic-dangerous-direct-browser-access": "true" });
  const ol = vi.fn(async (_url: string) => json({ models: [{ name: "qwen3:8b", size: 5_200_000_000 }] }));
  expect(await listModels(catalogueProvider("ollama")!, "", ol as never)).toEqual([{ id: "qwen3:8b", label: "qwen3:8b", note: "5.2 GB, on this computer" }]);
  expect(ol.mock.calls[0][0]).toBe("http://localhost:11434/api/tags");
});
