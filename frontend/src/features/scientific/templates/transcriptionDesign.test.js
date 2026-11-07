import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { geneticInformationTemplates } from "./library/geneticInformation";
import { assetById, validateDocument } from "../document";
import { labelLines } from "../IllustrationSvg";
import { exportSvg } from "../export";

const template = geneticInformationTemplates.find(item => item.id === "transcription-strand-direction");
const objects = template.document.objects;
const byName = name => objects.find(object => object.name === name);

describe("transcription teaching composition", () => {
  it("publishes a separate versioned draft without replacing saved compositions", () => {
    expect(template.version).toBe(2);
    expect(template.document.id).toBe("template-transcription-strand-direction-v2");
    expect(template.reviewStatus).toBe("draft");
    expect(template.references).toHaveLength(1);
    expect(() => validateDocument(template.document)).not.toThrow();
  });

  it("separates large sequence answers from editable strand-name chips", () => {
    for (const [name, sequence] of [
      ["Coding strand", "5′–ATG CCA TTT–3′"],
      ["Template strand", "3′–TAC GGT AAA–5′"],
      ["RNA product", "5′–AUG CCA UUU–3′"],
    ]) {
      const chip = byName(`${name} label`), background = byName(`${name} chip`);
      const notation = byName(`${name} sequence`);
      expect(chip).toMatchObject({ type: "text", text: name, isLabel: true });
      expect(background).toMatchObject({ type: "shape", groupId: chip.groupId });
      expect(background.id).not.toBe(chip.id);
      expect(objects.indexOf(background)).toBeLessThan(objects.indexOf(chip));
      expect(notation).toMatchObject({ type: "text", text: sequence, isLabel: true });
      expect(notation.fontSize).toBeGreaterThanOrEqual(38);
      expect(labelLines(notation)).toEqual([sequence]);
    }
  });

  it("keeps correct editable directions and a contextual notation legend", () => {
    const edge = objects.find(object => object.role === "rna-synthesis");
    expect(edge.startBinding.objectId).toBe(byName("Template strand sequence").id);
    expect(edge.endBinding.objectId).toBe(byName("RNA product sequence").id);
    expect(objects.some(object => object.text === "Template read 3′ → 5′")).toBe(true);
    expect(objects.some(object => object.text === "RNA elongated 5′ → 3′")).toBe(true);
    expect(byName("Sequence notation legend")).toMatchObject({ type: "text", role: "notation-legend" });
    for (const object of objects.filter(object => ["title", "subtitle", "notation-legend", "review-status"].includes(object.role))) {
      expect(object.isLabel).not.toBe(true);
    }
  });

  it("retains proportional approved DNA artwork and bounded, named editable layers", () => {
    const assets = objects.filter(object => object.type === "asset");
    expect(assets).toHaveLength(1);
    expect(assets[0].assetId).toBe("dna-double-helix");
    expect(assets[0].width / assets[0].height).toBeCloseTo(assetById[assets[0].assetId].aspectRatio, 4);
    expect(new Set(objects.map(object => object.id)).size).toBe(objects.length);
    for (const object of objects) {
      expect(object.name, object.id).toBeTruthy();
      expect(object.x).toBeGreaterThanOrEqual(0);
      expect(object.y).toBeGreaterThanOrEqual(0);
      expect(object.x + object.width).toBeLessThanOrEqual(1600);
      expect(object.y + object.height).toBeLessThanOrEqual(1000);
    }
  });

  it("exports the independently editable annotations with self-contained DNA vectors", async () => {
    const assets = resolve(dirname(fileURLToPath(import.meta.url)), "../assets");
    const svg = await exportSvg(template.document, { loadAsset: async id => readFileSync(resolve(assets, assetById[id].file), "utf8") });
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.querySelector("image")).toBeNull();
    expect(parsed.querySelector("path")).not.toBeNull();
    for (const text of ["Coding strand", "Template strand", "RNA product", "5′–ATG CCA TTT–3′", "3′–TAC GGT AAA–5′", "5′–AUG CCA UUU–3′"]) {
      expect([...parsed.querySelectorAll("text")].some(node => node.textContent === text)).toBe(true);
    }
  });
});
