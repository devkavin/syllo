import { boundsOf, selectionUnits } from "./geometry";

export const BINDING_ANCHORS = ["left", "right", "top", "bottom", "center", "point"];

export function anchorPoint(obj, binding) {
  const anchor = typeof binding === "string" ? binding : binding.anchor;
  const positions = { left: [0, 0.5], right: [1, 0.5], top: [0.5, 0], bottom: [0.5, 1], center: [0.5, 0.5], point: [binding.u, binding.v] };
  const [u, v] = positions[anchor] || positions.center;
  const dx = (u - 0.5) * obj.width, dy = (v - 0.5) * obj.height, a = obj.rotation * Math.PI / 180;
  return { x: obj.x + obj.width / 2 + dx * Math.cos(a) - dy * Math.sin(a), y: obj.y + obj.height / 2 + dx * Math.sin(a) + dy * Math.cos(a) };
}

export function lineEndpoints(obj) {
  return [anchorPoint(obj, { anchor: "point", u: obj.flipX ? 1 : 0, v: obj.flipY ? 1 : 0 }), anchorPoint(obj, { anchor: "point", u: obj.flipX ? 0 : 1, v: obj.flipY ? 0 : 1 })];
}

export function synchronizeBindings(doc) {
  const index = new Map(doc.objects.map(obj => [obj.id, obj]));
  const objects = doc.objects.map(obj => {
    if (!["arrow", "connector"].includes(obj.type) || (!obj.startBinding && !obj.endBinding)) return obj;
    const endpoints = lineEndpoints(obj);
    for (const [i, key] of [[0, "startBinding"], [1, "endBinding"]]) {
      const binding = obj[key], target = binding && index.get(binding.objectId);
      if (target) endpoints[i] = anchorPoint(target, binding);
    }
    const [start, end] = endpoints;
    return { ...obj, x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.max(1, Math.abs(end.x - start.x)), height: Math.max(1, Math.abs(end.y - start.y)), flipX: end.x < start.x, flipY: end.y < start.y, rotation: 0 };
  });
  return { ...doc, objects };
}

export function visibleObjects(doc) {
  const normalized = synchronizeBindings(doc);
  const hidden = new Set(normalized.objects.filter(obj => obj.hidden || (doc.showLabels === false && obj.isLabel)).map(obj => obj.id));
  return normalized.objects.filter(obj => !hidden.has(obj.id) && !hidden.has(obj.startBinding?.objectId) && !hidden.has(obj.endBinding?.objectId));
}

export function deleteSelection(doc, ids) {
  const current = synchronizeBindings(doc);
  const objects = current.objects.filter(obj => !ids.includes(obj.id)).map(obj => {
    const next = { ...obj };
    for (const key of ["startBinding", "endBinding"]) if (ids.includes(next[key]?.objectId)) delete next[key];
    if (ids.includes(next.labelFor)) delete next.labelFor;
    return next;
  });
  return synchronizeBindings({ ...doc, objects });
}

export function distributeSelection(doc, ids, direction) {
  const units = selectionUnits(doc.objects.filter(obj => ids.includes(obj.id)));
  if (units.length < 3) return doc;
  const axis = direction === "vertical" ? "y" : "x", size = axis === "x" ? "width" : "height";
  units.sort((a, b) => a.box[axis] - b.box[axis]);
  const box = boundsOf(units.flatMap(unit => unit.members));
  const gap = (box[size] - units.reduce((sum, unit) => sum + unit.box[size], 0)) / (units.length - 1);
  let position = box[axis]; const delta = new Map();
  for (const unit of units) { for (const obj of unit.members) delta.set(obj.id, position - unit.box[axis]); position += unit.box[size] + gap; }
  return synchronizeBindings({ ...doc, objects: doc.objects.map(obj => delta.has(obj.id) ? { ...obj, [axis]: obj[axis] + delta.get(obj.id) } : obj) });
}
