import { expect, it } from "vitest";
import { createDocument, createObject, validateDocument } from "./document";
import { createLibraryItem, placeComposition } from "./reusable";

it("saves a reusable group with internal bindings and detached external references", () => {
  const a = createObject("asset", { assetId: "mitochondrion", x: 600, y: 500 });
  const b = createObject("text", { x: 900, y: 500 });
  const line = createObject("arrow", { startBinding: { objectId: a.id, anchor: "right" }, endBinding: { objectId: b.id, anchor: "left" } });
  const doc = { ...createDocument(), objects: [a, b, line] };
  const item = createLibraryItem(doc, [a.id, line.id], "component", "Mitochondrial process");
  expect(item.document.objects[1].startBinding.objectId).toBe(item.document.objects[0].id);
  expect(item.document.objects[1].endBinding).toBeUndefined();
  expect(validateDocument(item.document)).toBe(item.document);
  const placed = placeComposition(item.document.objects, { x: 100, y: 200 });
  expect(placed[1].startBinding.objectId).toBe(placed[0].id);
  expect(placed[0].id).not.toBe(item.document.objects[0].id);
});

it("makes independent presets and rejects empty or unnamed components", () => {
  const doc = { ...createDocument(), objects: [createObject("text")] };
  const item = createLibraryItem(doc, [], "preset", "Revision map");
  expect(item.document.id).not.toBe(doc.id);
  expect(item.document.objects[0].id).not.toBe(doc.objects[0].id);
  expect(() => createLibraryItem(doc, [], "component", "Empty")).toThrow(/Select/);
  expect(() => createLibraryItem(doc, [], "preset", " ")).toThrow(/name/);
});
