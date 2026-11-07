import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { libraryTemplates } from "./libraryTemplates";
import { assetById, duplicateDocument, parseDocument, validateDocument } from "../document";
import { validateTemplate } from "../templateReview";
import { exportSvg } from "../export";

const assetDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../assets");
const loadAsset = async id => readFileSync(resolve(assetDirectory, assetById[id].file), "utf8");

describe("expanded scientific compositions", () => {
  it("adds at least 24 distinct, referenced drafts with canonical provenance", () => {
    expect(libraryTemplates.length).toBeGreaterThanOrEqual(24);
    expect(new Set(libraryTemplates.map(item => item.id)).size).toBe(libraryTemplates.length);
    expect(new Set(libraryTemplates.map(item => item.name)).size).toBe(libraryTemplates.length);
    for (const item of libraryTemplates) {
      expect(validateTemplate(item), item.id).toEqual({ valid: true, issues: [] });
      expect(item.reviewStatus).toBe("draft");
      expect(item.review).toBeUndefined();
      expect(item.reviewNotes).toMatch(/omit|not |simplif|overview|context/i);
      expect(item.document.version).toBe(2);
    }
  });

  it("contains bounded independent objects, proportional art, and editable bindings", () => {
    const allIds = [];
    for (const { id, document } of libraryTemplates) {
      expect(() => validateDocument(document), id).not.toThrow();
      const objects = new Map(document.objects.map(object => [object.id, object]));
      for (const object of document.objects) {
        allIds.push(object.id);
        expect(object.x, id).toBeGreaterThanOrEqual(0);
        expect(object.y, id).toBeGreaterThanOrEqual(0);
        expect(object.x + object.width, `${id}: ${object.text || object.assetId || object.id}`).toBeLessThanOrEqual(document.width + 1);
        expect(object.y + object.height, `${id}: ${object.text || object.assetId || object.id}`).toBeLessThanOrEqual(document.height + 1);
        if (object.type === "asset") expect(object.width / object.height, id).toBeCloseTo(assetById[object.assetId].aspectRatio, 4);
        for (const key of ["startBinding", "endBinding"]) if (object[key]) expect(["asset", "text", "shape", "highlight"]).toContain(objects.get(object[key].objectId)?.type);
        if (object.labelFor) expect(objects.has(object.labelFor), id).toBe(true);
      }
      const copy = duplicateDocument(parseDocument(JSON.stringify(document)));
      expect(copy.objects.every(object => !objects.has(object.id)), id).toBe(true);
      expect(() => validateDocument(copy), id).not.toThrow();
      expect(document.objects.some(object => object.type === "arrow" && object.startBinding && object.endBinding), id).toBe(true);
    }
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("retains scientific route direction in key teaching compositions", () => {
    const route = (templateId, role) => {
      const document = libraryTemplates.find(item => item.id === templateId).document;
      const edge = document.objects.find(object => object.role === role);
      const label = key => document.objects.find(object => object.id === edge[key].objectId).text;
      return [label("startBinding"), label("endBinding")];
    };
    expect(route("osmosis-water-potential", "net-water-flow")).toEqual([expect.stringContaining("Higher water potential"), expect.stringContaining("Lower water potential")]);
    expect(route("pulmonary-systemic-circuits", "pulmonary-outflow")).toEqual([expect.stringContaining("Right ventricle"), expect.stringContaining("Lungs")]);
    expect(route("nuclear-cytoplasmic-exchange", "mrna-export")).toEqual([expect.stringContaining("Nuclear"), expect.stringContaining("Cytoplasmic")]);
  });

  it("exports every composition as portable SVG with embedded vectors and credits", async () => {
    for (const item of libraryTemplates) {
      const svg = await exportSvg(item.document, { loadAsset });
      // Opt-in visual QA artifacts stay inside this checkout; ordinary tests are read-only.
      if (process.env.SYLLO_TEMPLATE_QA === "1") {
        const output = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../.cache/scientific-library-qa");
        mkdirSync(output, { recursive: true });
        writeFileSync(resolve(output, `${item.id}.svg`), svg);
      }
      const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
      expect(parsed.querySelector("parsererror"), item.id).toBeNull();
      expect(parsed.querySelector("image"), item.id).toBeNull();
      expect(parsed.querySelector("path"), item.id).not.toBeNull();
      const metadata = JSON.parse(parsed.querySelector("metadata").textContent);
      expect(metadata.assets.map(asset => asset.id).sort(), item.id).toEqual(item.attribution.map(asset => asset.id).sort());
      expect(metadata.attribution, item.id).toContain("Source:");
      const ids = [...parsed.querySelectorAll("[id]")].map(node => node.id);
      expect(new Set(ids).size, item.id).toBe(ids.length);
    }
  }, 30000);
});
