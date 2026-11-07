import { expect, it } from "vitest";
import { catalog } from "./document";
import { templates } from "./templates";
import { curriculumPacks, resolvePack } from "./packs";

it("resolves every curriculum reference to actual artwork and prepared templates", () => {
  expect(curriculumPacks).toHaveLength(6);
  for (const pack of curriculumPacks) {
    const resolved = resolvePack(pack.id);
    expect(resolved.assets.length).toBeGreaterThan(2);
    expect(resolved.templates.length).toBeGreaterThan(0);
    expect(resolved.assetCount).toBe(pack.assetIds.length);
    expect(resolved.templateCount).toBe(pack.templateIds.length);
    for (const id of pack.assetIds) expect(catalog.some(asset => asset.id === id), id).toBe(true);
    for (const id of pack.templateIds) expect(templates.some(template => template.id === id), id).toBe(true);
  }
  expect(resolvePack("gene-expression").templates.map(template => template.id)).toContain("transcription-strand-direction");
  expect(resolvePack("gene-expression")).toMatchObject({ assetCount: 9, templateCount: 7 });
});

it("derives counts from available registries and safely rejects unknown packs", () => {
  const pack = resolvePack("gene-expression", [{ id: "ribosome" }, { id: "unrelated" }], [{ id: "protein-synthesis" }]);
  expect(pack.assets).toEqual([{ id: "ribosome" }]);
  expect(pack.templates).toEqual([{ id: "protein-synthesis" }]);
  expect(pack.assetCount).toBe(1);
  expect(pack.templateCount).toBe(1);
  expect(resolvePack("unavailable")).toBeNull();
});
