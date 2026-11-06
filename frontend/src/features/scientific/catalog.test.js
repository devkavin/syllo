import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { catalog, createDocument, createObject } from "./document";
import { exportSvg, sanitizeAssetSvg } from "./export";
import { templates } from "./templates";

const read = file => readFileSync(new URL(file, import.meta.url), "utf8");

it("ships safe real SVGs with individually verified provenance and matching server catalog", () => {
  expect(catalog.length).toBeGreaterThanOrEqual(20);
  expect(JSON.parse(read("../../../../backend/app/data/scientific-assets.json"))).toEqual(catalog);
  for (const asset of catalog) {
    const source = read(`./assets/${asset.file}`);
    expect(sanitizeAssetSvg(source).querySelector("path, ellipse, circle, rect")).not.toBeNull();
    expect(asset.author).toBeTruthy(); expect(asset.sourceUrl).toMatch(/^https:/);
    expect(["CC0-1.0", "CC-BY-4.0", "MIT", "Public-Domain"]).toContain(asset.license);
    expect(createHash("sha256").update(source).digest("hex")).toBe(asset.sha256);
    expect(source).toContain("provenance"); expect(source).toContain(asset.license);
  }
});

it("ships prepared Phase 2 anatomy and organelles with honest annotation metadata", () => {
  for (const id of ["digestive-system", "respiratory-system", "animal-cell-detailed", "plant-cell-detailed", "nucleus", "chloroplast"]) {
    const asset = catalog.find(a => a.id === id);
    expect(asset).toBeTruthy();
    expect(asset.internalLabels).toBe(false);
    const vector = sanitizeAssetSvg(read(`./assets/${asset.file}`));
    expect(vector.querySelectorAll("text, tspan, image, foreignObject")).toHaveLength(0);
    const ids = [...vector.querySelectorAll("[id]")].map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const element of [vector, ...vector.querySelectorAll("*")]) {
      for (const attr of element.attributes) {
        for (const match of attr.value.matchAll(/url\(["']?#([^)'"\s]+)["']?\)/g)) expect(ids).toContain(match[1]);
        if (attr.localName === "href") expect(ids).toContain(attr.value.slice(1));
      }
    }
    for (const point of asset.landmarks || []) {
      expect(point.name).toBeTruthy();
      expect(point.u).toBeGreaterThan(0); expect(point.u).toBeLessThan(1);
      expect(point.v).toBeGreaterThan(0); expect(point.v).toBeLessThan(1);
    }
  }
  expect(read("./licenses/public-domain-ladyofhats.txt")).toContain("Source SHA-256");
});

it("exports the actual ETC vectors with no missing files or duplicate definition IDs", async () => {
  const svg = await exportSvg(templates[0].document, { loadAsset: async id => read(`./assets/${catalog.find(a => a.id === id).file}`) });
  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  expect(parsed.querySelector("parsererror")).toBeNull();
  expect(parsed.querySelectorAll("image")).toHaveLength(0);
  const ids = [...parsed.querySelectorAll("[id]")].map(node => node.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(parsed.documentElement.textContent).toContain("ADP + Pᵢ → ATP");
  expect(parsed.querySelectorAll("path").length).toBeGreaterThan(100);
});
