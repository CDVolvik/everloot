import { describe, expect, it } from "vitest";
import { tools } from "@/data/tools";
import sitemap from "@/app/sitemap";

describe("working feature discovery", () => {
  it("links directly to the working database and upload", () => {
    expect(tools.find((tool) => tool.slug === "database")).toMatchObject({ href: "/database", status: "collecting" });
    expect(tools.find((tool) => tool.slug === "upload")).toMatchObject({ href: "/upload", status: "live" });
  });
  it("describes routes that are still planned honestly", () => {
    expect(tools.find((tool) => tool.slug === "farming-routes")?.status).toBe("coming-soon");
  });
  it("lists canonical routes once without redirect or waitlist duplicates", () => {
    const urls = sitemap().map((entry) => new URL(entry.url).pathname);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain("/database");
    expect(urls).toContain("/upload");
    expect(urls).not.toContain("/tools/database");
    expect(urls).not.toContain("/tools/guild-tracker");
    expect(urls).not.toContain("/tools/completionist");
    expect(urls).not.toContain("/tools/profession-planner");
  });
});
