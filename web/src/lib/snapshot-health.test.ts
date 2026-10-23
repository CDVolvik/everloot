import { expect, test } from "vitest";
import { createUploadStore, type CloudConfig } from "./upload-store";
const cloud: CloudConfig = { r2AccountId: "acct", r2AccessKeyId: "key", r2SecretAccessKey: "secret", r2Bucket: "uploads", supabaseUrl: "https://sb.test", supabaseServiceKey: "svc" };
const now = () => new Date("2026-10-08T12:00:00Z");
const store = (response: Response) => createUploadStore({ cloud, localDir: ".", now, fetch: async input => {
  expect((input as Request).method).toBe("GET");
  return response;
} });
test("snapshot monitoring reads the successful cron heartbeat, with age and stale status", async () => {
  const fresh = await store(Response.json({ generatedAt: "2026-10-08T11:50:00Z" })).snapshotHealth();
  expect(fresh).toEqual({ status: "fresh", updatedAt: "2026-10-08T11:50:00.000Z", ageSeconds: 600 });
  expect((await store(Response.json({ generatedAt: "2026-10-08T11:00:00Z" })).snapshotHealth()).status).toBe("stale");
});
test("missing, failed and malformed/future metadata never masquerade as fresh", async () => {
  expect((await store(new Response(null, { status: 404 })).snapshotHealth()).status).toBe("missing");
  for (const response of [new Response(null, { status: 500 }), new Response(null), Response.json({ generatedAt: "2026-10-08T13:00:00Z" })]) {
    expect((await store(response).snapshotHealth()).status).toBe("unavailable");
  }
});
