import { expect, test } from "vitest";
import { collectionFactsFromRecords, handleCollectionGap, type CatalogSighting, type OwnedSighting } from "../src/collection-gap.js";

function catalog(installId: string, itemId: number, source = "Vendor"): CatalogSighting {
  return { installId, collection: "Mounts", source, itemId };
}

test("three installs publish the list and one install's owned set splits it", () => {
  const catalogRows = [
    catalog("a", 1), catalog("b", 1), catalog("c", 1),
    catalog("a", 2, "Drop"), catalog("b", 2, "Drop"), catalog("c", 2, "Drop"),
    catalog("a", 3), catalog("a", 3),
  ];
  const owned: OwnedSighting[] = [
    { installId: "owner", collection: "Mounts", itemId: 1 },
    { installId: "owner", collection: "Mounts", itemId: 9 },
  ];
  const text = handleCollectionGap({ collection: "mounts", ownerInstallId: "owner" }, { catalog: catalogRows, owned });
  expect(text).toContain("Owned: 1");
  expect(text).toContain("Missing: 2");
  expect(text).toContain("Drop");
  expect(text).toContain("still short of 3: 9");
  expect(text).not.toContain("Missing: 1");
});

test("two reporters, one install repeating itself, and a blank query stay empty", () => {
  const text = handleCollectionGap(
    { collection: "Mounts", ownerInstallId: "owner" },
    { catalog: [catalog("a", 1), catalog("a", 1), catalog("b", 1)], owned: [] },
  );
  expect(text).toContain("List unrecorded");
  expect(handleCollectionGap({ collection: " ", ownerInstallId: "owner" })).toBe("Name a collection.");
  expect(handleCollectionGap({ collection: "Mounts", ownerInstallId: " " })).toBe("Name the install.");
});

test("records become catalog and owned sightings", () => {
  const facts = collectionFactsFromRecords([
    { kind: "collection_catalog", installId: "a", collection: "Mounts", source: "Vendor", itemId: 1 },
    { kind: "collection_owned", installId: "owner", collection: "Mounts", itemId: 1 },
    { kind: "loot", installId: "a" },
  ]);
  expect(facts.catalog).toHaveLength(1);
  expect(facts.owned).toHaveLength(1);
});

test("an install that never uploaded the collection has an unrecorded owned set, not an empty one", () => {
  const catalogRows = [catalog("a", 1), catalog("b", 1), catalog("c", 1)];
  const text = handleCollectionGap({ collection: "Mounts", ownerInstallId: "stranger" }, { catalog: catalogRows, owned: [] });
  expect(text).toContain("Owned: unrecorded");
  expect(text).not.toContain("Owned: none");
  expect(text).not.toContain("Missing: 1");
  expect(text).toContain("Listed: 1");
});
