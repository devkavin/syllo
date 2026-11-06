import { describe, expect, it } from "vitest";
import { createDocument, createObject, duplicateObjects, parseDocument, transformObjects, validateDocument } from "./document";
import { anchorPoint, deleteSelection, distributeSelection, synchronizeBindings, visibleObjects } from "./composition";

const figure = () => {
  const a = createObject("asset", { assetId: "mitochondrion", id: "a", x: 100, y: 100, width: 100, height: 80 });
  const b = createObject("asset", { assetId: "ribosome", id: "b", x: 400, y: 120, width: 100, height: 100 });
  const line = createObject("arrow", { id: "edge", startBinding: { objectId: "a", anchor: "right" }, endBinding: { objectId: "b", anchor: "left" } });
  return { ...createDocument(), objects: [a, b, line] };
};

describe("advanced scientific composition", () => {
  it("opens v1 figures without changing identities, labels or transformations", () => {
    const doc = figure(); delete doc.objects[2].startBinding; delete doc.objects[2].endBinding; doc.version = 1;
    const migrated = parseDocument(JSON.stringify(doc));
    expect(migrated.version).toBe(2); expect(migrated.objects).toEqual(doc.objects); expect(migrated.id).toBe(doc.id);
  });
  it("keeps arrow endpoints attached after moving and rotating scientific artwork", () => {
    const doc = synchronizeBindings(figure());
    expect(doc.objects[2]).toMatchObject({ x: 200, y: 140, width: 200, height: 30 });
    const moved = transformObjects(doc, ["a"], { x: 220, rotation: 90 });
    expect(anchorPoint(moved.objects[0], "right")).toEqual({ x: 270, y: 190 });
    expect(moved.objects[2]).toMatchObject({ x: 270, y: 170, width: 130, height: 20, flipY: true });
  });
  it("duplicates attachments within a composition and detaches outside references", () => {
    const doc = synchronizeBindings(figure());
    const copies = duplicateObjects(doc.objects, 20);
    expect(copies[2].startBinding.objectId).toBe(copies[0].id);
    expect(copies[2].endBinding.objectId).toBe(copies[1].id);
    expect(duplicateObjects([doc.objects[2]])[0].startBinding).toBeUndefined();
  });
  it("freezes endpoint geometry when deleting a bound target", () => {
    const doc = synchronizeBindings(figure()), next = deleteSelection(doc, ["a"]);
    expect(next.objects.find(o => o.id === "edge").startBinding).toBeUndefined();
    expect(next.objects.find(o => o.id === "edge").x).toBe(200);
    expect(validateDocument(next)).toEqual(next);
  });
  it("omits hidden labels and their attached pointers from every rendering", () => {
    const doc = figure(); doc.objects[0].hidden = true;
    expect(visibleObjects(doc).map(o => o.id)).toEqual(["b"]);
    const label = createObject("text", { isLabel: true, text: "Matrix" });
    expect(visibleObjects({ ...createDocument(), showLabels: false, objects: [label] })).toEqual([]);
  });
  it("distributes groups as units and preserves their inner spacing", () => {
    const doc = createDocument();
    doc.objects = [createObject("shape", { id: "a", x: 0, width: 50, groupId: "g" }), createObject("text", { id: "al", x: 50, width: 50, groupId: "g" }), createObject("shape", { id: "b", x: 110, width: 100 }), createObject("shape", { id: "c", x: 600, width: 100 })];
    const next = distributeSelection(doc, doc.objects.map(o => o.id), "horizontal");
    expect(next.objects[1].x - next.objects[0].x).toBe(50);
    expect(next.objects[2].x).toBe(300);
  });
  it("rejects malformed flags, endpoint references, and unknown document fields", () => {
    const doc = figure();
    expect(() => validateDocument({ ...doc, remoteUrl: "https://evil.test/x" })).toThrow();
    expect(() => validateDocument({ ...doc, objects: [createObject("text", { locked: "true" })] })).toThrow();
    expect(() => validateDocument({ ...doc, objects: [createObject("arrow", { startBinding: { objectId: "missing", anchor: "center" } })] })).toThrow();
  });
});
