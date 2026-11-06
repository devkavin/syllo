import { boundsOf, createDocument, duplicateObjects, uid, validateDocument } from "./document";
import { synchronizeBindings } from "./composition";

export function createLibraryItem(doc, ids, kind, name) {
  if (!["component", "preset"].includes(kind) || !name.trim() || name.trim().length > 120) throw new Error("Give your saved item a name (up to 120 characters).");
  let document;
  if (kind === "preset") document = { ...doc, id: uid(), title: name.trim(), objects: duplicateObjects(doc.objects, 0) };
  else {
    const objects = synchronizeBindings(doc).objects.filter(obj => ids.includes(obj.id));
    if (!objects.length) throw new Error("Select objects to save as a component.");
    const box = boundsOf(objects);
    document = { ...createDocument(name.trim()), width: Math.max(200, Math.ceil(box.width + 80)), height: Math.max(200, Math.ceil(box.height + 80)),
      objects: duplicateObjects(objects, 0).map(obj => ({ ...obj, x: obj.x - box.x + 40, y: obj.y - box.y + 40 })) };
    const groupId = uid(); document.objects = document.objects.map(obj => ({ ...obj, groupId }));
  }
  validateDocument(document);
  return { id: uid(), name: name.trim(), kind, document };
}

export function placeComposition(objects, point) {
  if (!objects.length) return [];
  const copies = duplicateObjects(objects, 0), box = boundsOf(copies);
  return copies.map(obj => ({ ...obj, x: obj.x - box.x + point.x, y: obj.y - box.y + point.y, locked: false }));
}
