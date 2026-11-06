import catalog from "./catalog.json";
import { boundsOf } from "./geometry";
import { BINDING_ANCHORS, synchronizeBindings } from "./composition";
export { boundsOf } from "./geometry";

export const SCHEMA_VERSION = 2;
export const MAX_OBJECTS = 600;
export const uid = () => crypto.randomUUID();
export const assetById = Object.assign(Object.create(null), Object.fromEntries(catalog.map(asset => [asset.id, asset])));
export const categories = [...new Set(catalog.map(asset => asset.category))];
const files = import.meta.glob("./assets/*.svg", { eager: true, query: "?url", import: "default" });
export const assetUrl = id => assetById[id] ? files[`./assets/${assetById[id].file}`] : undefined;
export { catalog };

const TYPES = new Set(["asset", "text", "arrow", "connector", "shape", "highlight"]);
const COLOR = /^#[a-f\d]{6}$/i;
const ID = /^[a-z\d_-]{1,100}$/i;
const validId = value => typeof value === "string" && ID.test(value);
const numeric = (value, low, high) => typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function createDocument(title = "Untitled illustration") {
  return { version: SCHEMA_VERSION, id: uid(), title, width: 1400, height: 850, background: "#fffdf9", objects: [] };
}

export function createObject(type, props = {}) {
  const defaults = { id: uid(), type, x: 100, y: 100, width: 180, height: 120, rotation: 0, opacity: 1 };
  if (type === "text") Object.assign(defaults, { text: "Scientific label", width: 280, height: 42, fontSize: 24, color: "#334155", bold: false });
  if (["arrow", "connector"].includes(type)) Object.assign(defaults, { width: 180, height: 2, color: "#3b64b5", strokeWidth: 3, flipX: false, flipY: false });
  if (["shape", "highlight"].includes(type)) Object.assign(defaults, { shape: "rect", color: type === "highlight" ? "#f7d46b" : "#dcebdc", opacity: type === "highlight" ? 0.35 : 1 });
  return { ...defaults, ...props };
}

export function validateDocument(input, { allowMissingAssets = false } = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Invalid illustration document");
  assert([1, 2].includes(input.version), "This illustration version is not supported. Your saved document has been preserved.");
  assert(Object.keys(input).every(key => ["version", "id", "title", "width", "height", "background", "objects", "templateId", "templateVersion", "showLabels"].includes(key)), "Unsupported document property");
  assert(validId(input.id), "Invalid document ID");
  assert(typeof input.title === "string" && input.title.length <= 240, "Title must be at most 240 characters");
  assert(numeric(input.width, 200, 4000) && numeric(input.height, 200, 4000), "Canvas must be between 200 and 4000 pixels");
  assert(typeof input.background === "string" && COLOR.test(input.background), "Invalid canvas color");
  if (input.showLabels !== undefined) assert(typeof input.showLabels === "boolean", "Invalid label visibility");
  if (input.templateId !== undefined) assert(validId(input.templateId), "Invalid template reference");
  if (input.templateVersion !== undefined) assert(numeric(input.templateVersion, 1, 10000) && Number.isInteger(input.templateVersion), "Invalid template version");
  assert(Array.isArray(input.objects) && input.objects.length <= MAX_OBJECTS, "Illustrations support up to 600 objects");
  const ids = new Set();
  for (const obj of input.objects) {
    assert(obj && typeof obj === "object" && TYPES.has(obj.type), "Unsupported illustration object");
    const common = ["id", "type", "x", "y", "width", "height", "rotation", "opacity", "groupId", "name", "role", "hidden", "locked", "isLabel", "labelFor"];
    const typed = obj.type === "asset" ? ["assetId"] : obj.type === "text" ? ["text", "fontSize", "color", "bold"] : ["arrow", "connector"].includes(obj.type) ? ["color", "strokeWidth", "flipX", "flipY", "startBinding", "endBinding"] : ["shape", "color"];
    assert(Object.keys(obj).every(key => common.includes(key) || typed.includes(key)), "Unsupported object property");
    assert(validId(obj.id) && !ids.has(obj.id), "Objects require unique stable IDs"); ids.add(obj.id);
    for (const key of ["x", "y"]) assert(numeric(obj[key], -8000, 8000), "Invalid object position");
    for (const key of ["width", "height"]) assert(numeric(obj[key], 1, 8000), "Invalid object size");
    assert(numeric(obj.rotation, -3600, 3600) && numeric(obj.opacity, 0, 1), "Invalid object transform");
    if (obj.groupId !== undefined) assert(validId(obj.groupId), "Invalid group");
    if (obj.type === "asset") assert(typeof obj.assetId === "string" && ID.test(obj.assetId) && (allowMissingAssets || assetById[obj.assetId]), "This asset is not in the approved library");
    else assert(typeof obj.color === "string" && COLOR.test(obj.color), "Invalid object color");
    for (const key of ["hidden", "locked", "isLabel"]) if (obj[key] !== undefined) assert(typeof obj[key] === "boolean", "Invalid layer flag");
    for (const key of ["name", "role"]) if (obj[key] !== undefined) assert(typeof obj[key] === "string" && obj[key].length <= 120, "Invalid object name");
    if (obj.type === "text") {
      assert(typeof obj.text === "string" && obj.text.length <= 4000 && obj.text.split("\n").length <= 40, "Labels support up to 4000 characters and 40 lines");
      assert(numeric(obj.fontSize, 8, 160), "Invalid font size");
      if (obj.bold !== undefined) assert(typeof obj.bold === "boolean", "Invalid text weight");
    }
    if (["arrow", "connector"].includes(obj.type)) {
      assert(numeric(obj.strokeWidth, 1, 20), "Invalid line width");
      for (const key of ["flipX", "flipY"]) if (obj[key] !== undefined) assert(typeof obj[key] === "boolean", "Invalid line direction");
    }
    if (["shape", "highlight"].includes(obj.type)) assert(["rect", "ellipse"].includes(obj.shape), "Invalid annotation shape");
  }
  const index = new Map(input.objects.map(obj => [obj.id, obj]));
  for (const obj of input.objects) {
    if (obj.labelFor !== undefined) assert(validId(obj.labelFor) && index.has(obj.labelFor) && obj.labelFor !== obj.id, "Invalid label target");
    for (const key of ["startBinding", "endBinding"]) if (obj[key] !== undefined) {
      const binding = obj[key], target = binding && index.get(binding.objectId);
      assert(binding && typeof binding === "object" && !Array.isArray(binding) && Object.keys(binding).every(k => ["objectId", "anchor", "u", "v"].includes(k)), "Invalid connector binding");
      assert(target && !["arrow", "connector"].includes(target.type) && target.id !== obj.id && BINDING_ANCHORS.includes(binding.anchor), "Invalid connector target");
      for (const axis of ["u", "v"]) if (binding[axis] !== undefined) assert(numeric(binding[axis], 0, 1), "Invalid connector anchor");
      if (binding.anchor === "point") assert(numeric(binding.u, 0, 1) && numeric(binding.v, 0, 1), "Invalid connector anchor");
    }
  }
  assert(new TextEncoder().encode(JSON.stringify(input)).byteLength < 350000, "Illustration document is too large (350 KB maximum)");
  return input;
}

export function parseDocument(value) {
  const doc = validateDocument(typeof value === "string" ? JSON.parse(value) : value, { allowMissingAssets: true });
  return synchronizeBindings({ ...doc, version: SCHEMA_VERSION, objects: doc.objects.map(obj => ({ ...obj })) });
}

export function duplicateObjects(objects, offset = 24) {
  const groups = new Map();
  const ids = new Map(objects.map(obj => [obj.id, uid()]));
  return objects.map(obj => {
    if (obj.groupId && !groups.has(obj.groupId)) groups.set(obj.groupId, uid());
    const copy = { ...obj, id: ids.get(obj.id), x: obj.x + offset, y: obj.y + offset, ...(obj.groupId ? { groupId: groups.get(obj.groupId) } : {}) };
    for (const key of ["startBinding", "endBinding"]) if (copy[key]) { if (ids.has(copy[key].objectId)) copy[key] = { ...copy[key], objectId: ids.get(copy[key].objectId) }; else delete copy[key]; }
    if (copy.labelFor) { if (ids.has(copy.labelFor)) copy.labelFor = ids.get(copy.labelFor); else delete copy.labelFor; }
    return copy;
  });
}

export function duplicateDocument(doc) {
  return { ...doc, id: uid(), objects: duplicateObjects(doc.objects, 0) };
}

export function transformObjects(doc, selected, patch) {
  return synchronizeBindings({ ...doc, objects: doc.objects.map(obj => selected.includes(obj.id) ? Object.fromEntries(Object.entries({ ...obj, ...(typeof patch === "function" ? patch(obj) : patch) }).filter(([, value]) => value !== undefined)) : obj) });
}

export function expandSelection(objects, ids) {
  const groups = new Set(objects.filter(obj => ids.includes(obj.id) && obj.groupId).map(obj => obj.groupId));
  return objects.filter(obj => ids.includes(obj.id) || groups.has(obj.groupId)).map(obj => obj.id);
}

export function scaleSelection(doc, ids, scale) {
  const box = boundsOf(doc.objects.filter(obj => ids.includes(obj.id)));
  return transformObjects(doc, ids, obj => {
    const width = obj.width * scale, height = obj.height * scale;
    const cx = box.x + (obj.x + obj.width / 2 - box.x) * scale;
    const cy = box.y + (obj.y + obj.height / 2 - box.y) * scale;
    return { x: cx - width / 2, y: cy - height / 2, width, height,
      ...(obj.type === "text" ? { fontSize: Math.max(8, Math.min(160, obj.fontSize * scale)) } : {}) };
  });
}

export function rotateSelection(doc, ids, degrees) {
  const box = boundsOf(doc.objects.filter(obj => ids.includes(obj.id)));
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, angle = degrees * Math.PI / 180;
  return transformObjects(doc, ids, obj => {
    const dx = obj.x + obj.width / 2 - cx, dy = obj.y + obj.height / 2 - cy;
    return { x: cx + dx * Math.cos(angle) - dy * Math.sin(angle) - obj.width / 2,
      y: cy + dx * Math.sin(angle) + dy * Math.cos(angle) - obj.height / 2,
      rotation: ((obj.rotation + degrees + 180) % 360 + 360) % 360 - 180 };
  });
}

export function alignSelection(doc, ids, direction) {
  const selected = doc.objects.filter(obj => ids.includes(obj.id));
  const box = boundsOf(selected), units = new Map();
  for (const obj of selected) {
    const key = obj.groupId || obj.id;
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(obj);
  }
  const patches = new Map();
  for (const members of units.values()) {
    const own = boundsOf(members);
    const dx = direction === "left" ? box.x - own.x : direction === "right" ? box.x + box.width - own.x - own.width : direction === "center" ? box.x + box.width / 2 - own.x - own.width / 2 : 0;
    const dy = direction === "top" ? box.y - own.y : direction === "bottom" ? box.y + box.height - own.y - own.height : direction === "middle" ? box.y + box.height / 2 - own.y - own.height / 2 : 0;
    for (const obj of members) patches.set(obj.id, { x: obj.x + dx, y: obj.y + dy });
  }
  return transformObjects(doc, ids, obj => patches.get(obj.id));
}

export const initialHistory = doc => ({ past: [], present: doc, future: [] });
export function documentReducer(state, action) {
  if (action.type === "commit") {
    validateDocument(action.document, { allowMissingAssets: true });
    if (JSON.stringify(action.document) === JSON.stringify(state.present)) return state;
    return { past: [...state.past, state.present].slice(-60), present: action.document, future: [] };
  }
  if (action.type === "undo" && state.past.length) return { past: state.past.slice(0, -1), present: state.past.at(-1), future: [state.present, ...state.future] };
  if (action.type === "redo" && state.future.length) return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
  return state;
}

export function usedAssets(doc) {
  return [...new Set(doc.objects.filter(obj => obj.type === "asset").map(obj => obj.assetId))].map(id => assetById[id]).filter(Boolean);
}

export function creditsFor(doc) {
  return usedAssets(doc).map(a => `${a.name} by ${a.author}. ${a.license} (${a.licenseUrl}). Source: ${a.sourceUrl}. Modifications: ${a.modifications} Placement, scaling and rotation may differ in this composition.`).join("\n\n");
}
