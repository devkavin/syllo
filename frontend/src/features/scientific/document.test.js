import { describe, expect, it } from "vitest";
import { createDocument, validateDocument, createObject, duplicateObjects, transformObjects, documentReducer, initialHistory, boundsOf, scaleSelection, rotateSelection, alignSelection } from "./document";

describe("scientific documents", () => {
  it("aligns grouped artwork without collapsing its internal composition", () => {
    const doc = createDocument();
    doc.objects = [createObject("asset", { assetId: "ribosome", x: 100, width: 50, groupId: "complex" }), createObject("text", { x: 200, width: 80, text: "rRNA", groupId: "complex" }), createObject("asset", { assetId: "mitochondrion", x: 500, width: 100 })];
    const result = alignSelection(doc, doc.objects.map(o => o.id), "left");
    expect(result.objects[1].x - result.objects[0].x).toBe(100);
    expect(result.objects[2].x).toBe(100);
  });
  it("round trips independent scientific objects with stable identities", () => {
    const doc = createDocument();
    doc.objects = [createObject("asset", { assetId: "mitochondrion" }), createObject("text", { text: "H₂O + NAD⁺ → Δψ" })];
    expect(validateDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    expect(doc.objects[0].id).not.toBe(doc.objects[1].id);
  });
  it("rejects unsupported versions, missing licenses, external assets, huge documents and unsafe text properties", () => {
    const doc = createDocument();
    expect(() => validateDocument({ ...doc, version: 9 })).toThrow();
    expect(() => validateDocument({ ...doc, objects: [createObject("asset", { assetId: "https://evil.test/x.svg" })] })).toThrow();
    expect(() => validateDocument({ ...doc, objects: [createObject("asset", { assetId: "constructor" })] })).toThrow();
    expect(() => validateDocument({ ...doc, id: undefined })).toThrow();
    expect(() => validateDocument({ ...doc, objects: [createObject("text", { id: undefined })] })).toThrow();
    expect(() => validateDocument({ ...doc, objects: [createObject("shape", { color: "url(https://evil.test)" })] })).toThrow();
    expect(() => validateDocument({ ...doc, width: Infinity })).toThrow();
    expect(() => validateDocument({ ...doc, objects: Array(601).fill(createObject("text")) })).toThrow();
    expect(() => validateDocument({ ...doc, objects: [createObject("text", { width: -1 })] })).toThrow();
  });
  it("duplicates groups with fresh IDs and does not change the source", () => {
    const source = [createObject("asset", { assetId: "ribosome", groupId: "group-a" }), createObject("text", { text: "rRNA", groupId: "group-a" })];
    const copy = duplicateObjects(source);
    expect(copy[0].id).not.toBe(source[0].id);
    expect(copy[0].groupId).toBe(copy[1].groupId);
    expect(copy[0].groupId).not.toBe(source[0].groupId);
    expect(copy[0].x).toBe(source[0].x + 24);
    expect(source[0].x).toBe(100);
  });
  it("moves selected objects without losing labels and supports undo/redo branches", () => {
    const doc = createDocument(); doc.objects = [createObject("text", { text: "CO₂" })];
    const next = transformObjects(doc, [doc.objects[0].id], { x: 300, rotation: 45 });
    let state = documentReducer(initialHistory(doc), { type: "commit", document: next });
    state = documentReducer(state, { type: "undo" }); expect(state.present.objects[0].x).toBe(100);
    state = documentReducer(state, { type: "redo" }); expect(state.present.objects[0].rotation).toBe(45);
    state = documentReducer(state, { type: "undo" });
    state = documentReducer(state, { type: "commit", document: transformObjects(doc, [doc.objects[0].id], { text: "H⁺" }) });
    expect(state.future).toEqual([]); expect(state.present.objects[0].text).toBe("H⁺");
  });
  it("includes rotated objects in fit bounds", () => {
    const box = boundsOf([createObject("shape", { x: 100, y: 100, width: 100, height: 50, rotation: 90 })]);
    expect(box.width).toBeCloseTo(50); expect(box.height).toBeCloseTo(100);
  });
  it("enforces the same UTF-8 byte bound as the server for scientific Unicode", () => {
    const doc = createDocument();
    doc.objects = Array.from({ length: 60 }, () => createObject("text", { text: "α".repeat(4000) }));
    expect(JSON.stringify(doc).length).toBeLessThan(350000);
    expect(() => validateDocument(doc)).toThrow(/large/);
  });
  it("scales and rotates grouped objects around shared bounds without flattening labels", () => {
    const doc = createDocument();
    doc.objects = [createObject("shape", { x: 100, y: 100, width: 100, height: 100, groupId: "g" }), createObject("text", { x: 300, y: 100, width: 100, height: 100, text: "H₂O", groupId: "g", fontSize: 20 }), createObject("asset", { assetId: "ribosome", x: 600 })];
    const ids = doc.objects.slice(0, 2).map(o => o.id);
    const scaled = scaleSelection(doc, ids, 2);
    expect(scaled.objects[0]).toMatchObject({ x: 100, y: 100, width: 200, height: 200 });
    expect(scaled.objects[1]).toMatchObject({ x: 500, fontSize: 40, text: "H₂O", groupId: "g" });
    const rotated = rotateSelection(doc, ids, 90);
    expect(rotated.objects[0].x).toBeCloseTo(200); expect(rotated.objects[0].y).toBeCloseTo(0);
    expect(rotated.objects[1].y).toBeCloseTo(200); expect(rotated.objects[1].rotation).toBe(90);
    expect(rotated.objects[2]).toEqual(doc.objects[2]);
    expect(validateDocument(rotated)).toEqual(rotated);
  });
});
