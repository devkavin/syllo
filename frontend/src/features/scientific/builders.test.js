import { describe, expect, it } from "vitest";
import { createDocument, validateDocument } from "./document";
import { buildAnatomy, buildMembrane, buildProcess } from "./builders";

const asDocument = objects => ({ ...createDocument(), objects });

describe("prepared scientific builders", () => {
  it("composes a real bilayer and the requested count of approved proteins", () => {
    const objects = buildMembrane({ length: 750, proteinCount: 3 });
    expect(objects.filter(o => o.assetId === "etc-bilayer")).toHaveLength(1);
    expect(objects.filter(o => o.assetId === "calcium-channel")).toHaveLength(3);
    const bilayer = objects.find(o => o.assetId === "etc-bilayer"), protein = objects.find(o => o.assetId === "calcium-channel");
    expect(protein.y).toBeLessThan(bilayer.y);
    expect(protein.y + protein.height).toBeGreaterThan(bilayer.y + bilayer.height);
    expect(objects.filter(o => o.type === "text").every(o => o.isLabel && o.labelFor)).toBe(true);
    expect(validateDocument(asDocument(objects))).toBeTruthy();
  });
  it("bounds membrane dimensions and rotates the whole arrangement vertically", () => {
    const horizontal = buildMembrane({ length: 100000, proteinCount: 100 });
    expect(horizontal.filter(o => o.assetId === "calcium-channel")).toHaveLength(8);
    expect(horizontal.filter(o => o.assetId === "etc-bilayer")).toHaveLength(2);
    expect(horizontal.find(o => o.assetId === "etc-bilayer").width).toBeLessThanOrEqual(1800);
    const vertical = buildMembrane({ orientation: "vertical" });
    expect(vertical.find(o => o.assetId === "etc-bilayer").rotation).toBe(90);
    expect(() => buildMembrane({ proteinId: "human-heart" })).toThrow(/protein/i);
    expect(() => buildMembrane({ length: NaN })).toThrow();
  });
  it("links consecutive process artwork with bindings and editable interaction labels", () => {
    const objects = buildProcess({ assetIds: ["dna-double-helix", "ribosome", "transfer-rna"], labels: ["DNA", "Ribosome", "tRNA"], interactionLabels: ["transcription overview", "translation overview"] });
    const assets = objects.filter(o => o.type === "asset"), arrows = objects.filter(o => o.type === "arrow");
    expect(arrows).toHaveLength(2);
    expect(arrows[0].startBinding).toEqual({ objectId: assets[0].id, anchor: "right" });
    expect(arrows[0].endBinding).toEqual({ objectId: assets[1].id, anchor: "left" });
    expect(arrows[1].endBinding.objectId).toBe(assets[2].id);
    expect(objects.some(o => o.type === "text" && o.text === "transcription overview")).toBe(true);
    expect(validateDocument(asDocument(objects))).toBeTruthy();
  });
  it("creates vertical process arrows and never accepts unknown or excessive artwork", () => {
    const objects = buildProcess({ assetIds: ["ribosome", "transfer-rna"], direction: "vertical" });
    const arrow = objects.find(o => o.type === "arrow");
    expect(arrow.startBinding.anchor).toBe("bottom"); expect(arrow.endBinding.anchor).toBe("top");
    expect(arrow.flipY).toBe(false); expect(arrow.height).toBeGreaterThan(1);
    expect(() => buildProcess({ assetIds: ["unapproved"] })).toThrow(/approved/i);
    expect(() => buildProcess({ assetIds: [] })).toThrow();
    expect(() => buildProcess({ assetIds: Array(9).fill("ribosome") })).toThrow();
  });
  it("creates fresh editable objects, groups and internal bindings on every invocation", () => {
    const options = { assetIds: ["ribosome", "transfer-rna"] };
    const first = buildProcess(options), second = buildProcess(options);
    expect(new Set([...first, ...second].map(o => o.id)).size).toBe(first.length + second.length);
    expect(first[0].groupId).not.toBe(second[0].groupId);
    first[0].x = -200;
    expect(second[0].x).toBeGreaterThanOrEqual(0);
  });
  it("prepares inspected heart landmarks with independently hideable labels and pointers", () => {
    const objects = buildAnatomy({ assetId: "human-heart" });
    const art = objects.find(o => o.type === "asset"), labels = objects.filter(o => o.type === "text");
    expect(labels.some(o => o.text.includes("Diastole"))).toBe(true);
    expect(labels.every(o => o.isLabel && o.labelFor === art.id)).toBe(true);
    expect(objects.filter(o => o.type === "connector").every(o => o.endBinding.objectId === art.id && o.endBinding.anchor === "point")).toBe(true);
    expect(buildAnatomy({ assetId: "human-heart", showLabels: false }).filter(o => o.isLabel).every(o => o.hidden)).toBe(true);
    expect(validateDocument(asDocument(objects))).toBeTruthy();
    expect(() => buildAnatomy({ assetId: "ribosome" })).toThrow(/prepared/i);
  });
  it("anchors digestive and respiratory labels to inspected normalized source landmarks", () => {
    for (const [assetId, text, u, v] of [["digestive-system", "Esophagus", 0.5165, 0.3417], ["respiratory-system", "Trachea", 0.45676, 0.42042]]) {
      const objects = buildAnatomy({ assetId }), label = objects.find(o => o.text === text), art = objects.find(o => o.type === "asset");
      const pointer = objects.find(o => o.startBinding?.objectId === label.id);
      expect(pointer.endBinding).toEqual({ objectId: art.id, anchor: "point", u, v });
      expect(validateDocument(asDocument(objects))).toBeTruthy();
    }
  });
});
