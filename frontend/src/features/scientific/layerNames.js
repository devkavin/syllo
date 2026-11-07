import { assetById } from "./document";

export const objectName = obj => obj.name || (obj.type === "asset" ? assetById[obj.assetId]?.name || "Unavailable asset" : obj.type === "text" ? obj.text.split("\n")[0] : obj.type === "arrow" ? "Directional arrow" : obj.type === "connector" ? "Connector" : "Annotation");

export function outlineUnits(objects) {
  const units = [], groups = new Map();
  for (const obj of objects) {
    let unit = obj.groupId && groups.get(obj.groupId);
    if (!unit) {
      unit = { id: obj.groupId || obj.id, objects: [], grouped: Boolean(obj.groupId) };
      units.push(unit);
      if (obj.groupId) groups.set(obj.groupId, unit);
    }
    unit.objects.push(obj);
  }
  const contextRoles = ["title", "subtitle", "section-heading", "review-status", "scope-note", "notation-legend"];
  return units.map(unit => {
    const primary = unit.objects.find(obj => obj.type === "asset") || unit.objects.find(obj => obj.isLabel && obj.type === "text") || unit.objects.find(obj => obj.type === "text") || unit.objects[0];
    return { ...unit, name: objectName(primary).replace(/ (?:label|sequence)$/, ""), context: unit.objects.every(obj => contextRoles.includes(obj.role)) || (unit.objects.some(obj => obj.role === "notation-legend") && !unit.objects.some(obj => obj.isLabel || obj.type === "asset")) };
  });
}
