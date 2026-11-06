import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import IllustrationSvg from "./IllustrationSvg";
import { assetUrl, assetById, creditsFor, usedAssets, validateDocument } from "./document";
import { embedPngMetadata } from "./pngMetadata";
import { visibleObjects } from "./composition";

const NS = "http://www.w3.org/2000/svg";
const safeTags = new Set("svg g defs path rect circle ellipse line polyline polygon text tspan linearGradient radialGradient stop clipPath mask pattern marker use title desc metadata".split(" "));
const cache = new Map();

export function sanitizeAssetSvg(source) {
  if (typeof source !== "string" || source.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("Unsafe SVG source");
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = parsed.documentElement;
  if (parsed.querySelector("parsererror") || root.localName !== "svg" || root.namespaceURI !== NS) throw new Error("Invalid SVG");
  for (const element of [root, ...root.querySelectorAll("*")]) {
    if (element.namespaceURI !== NS || !safeTags.has(element.localName)) throw new Error(`Unsafe SVG content: ${element.localName} (${element.namespaceURI})`);
    for (const attr of element.attributes) {
      if (/^on/i.test(attr.localName)) throw new Error("SVG event handlers are forbidden");
      if (attr.name.startsWith("xmlns")) continue;
      if (attr.localName === "href" && !/^#[\w:.-]+$/.test(attr.value)) throw new Error("External SVG references are forbidden");
      if (/(?:javascript:|data:|https?:|@import|expression\s*\()/i.test(attr.value)) throw new Error("Unsafe SVG attribute");
      for (const match of attr.value.matchAll(/url\((.*?)\)/g)) if (!/^#[\w:.-]+$/.test(match[1].replace(/["']/g, "").trim())) throw new Error("External SVG URL");
    }
  }
  return root;
}

export async function loadAssetSvg(id) {
  if (!assetById[id] || !assetUrl(id)) throw new Error(`Scientific asset unavailable: ${id}`);
  if (!cache.has(id)) cache.set(id, fetch(assetUrl(id)).then(async response => {
    if (!response.ok) throw new Error(`Could not load ${assetById[id].name}. Reconnect and retry.`);
    const text = await response.text(); sanitizeAssetSvg(text); return text;
  }).catch(error => { cache.delete(id); throw error; }));
  return cache.get(id);
}

export async function exportSvg(doc, { loadAsset = loadAssetSvg } = {}) {
  validateDocument(doc);
  const source = renderToStaticMarkup(React.createElement(IllustrationSvg, { document: doc, prefix: "export" }));
  const root = new DOMParser().parseFromString(source, "image/svg+xml").documentElement;
  root.setAttribute("width", doc.width); root.setAttribute("height", doc.height);
  const metadata = root.ownerDocument.createElementNS(NS, "metadata");
  metadata.textContent = JSON.stringify({ title: doc.title, schemaVersion: doc.version, assets: usedAssets(doc), attribution: creditsFor(doc) });
  root.insertBefore(metadata, root.firstChild);
  const images = [...root.querySelectorAll("image")];
  const assets = visibleObjects(doc).filter(obj => obj.type === "asset");
  await Promise.all(images.map(async (image, i) => {
    const obj = assets[i];
    const vector = sanitizeAssetSvg(await loadAsset(obj.assetId)).cloneNode(true);
    vector.setAttribute("x", "0"); vector.setAttribute("y", "0"); vector.setAttribute("width", obj.width); vector.setAttribute("height", obj.height);
    vector.setAttribute("preserveAspectRatio", "xMidYMid meet");
    // Definitions must be unique even when the same asset is inserted twice.
    const prefix = `asset-${i}-`;
    for (const element of [vector, ...vector.querySelectorAll("*")]) {
      if (element.id) element.id = prefix + element.id;
      for (const attr of [...element.attributes]) {
        if (attr.localName === "href" && attr.value.startsWith("#")) element.setAttribute(attr.name, `#${prefix}${attr.value.slice(1)}`);
        else if (attr.value.includes("url(")) element.setAttribute(attr.name, attr.value.replace(/url\(["']?#([^)'"\s]+)["']?\)/g, `url(#${prefix}$1)`));
      }
    }
    image.replaceWith(vector);
  }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`;
}

export async function rasterize(svg, width, height) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("Could not render the figure. Your editable document is still available.")); image.src = url; });
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot generate PNG previews");
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}

export async function generatePreview(doc) {
  let scale = Math.min(560 / doc.width, 560 / doc.height, 1);
  const svg = await exportSvg(doc);
  for (let attempt = 0; attempt < 5; attempt++) {
    const width = Math.max(1, Math.round(doc.width * scale)), height = Math.max(1, Math.round(doc.height * scale));
    const preview = (await rasterize(svg, width, height)).toDataURL("image/png");
    if (preview.length <= 180000) return preview;
    scale *= 0.7;
  }
  throw new Error("PNG preview exceeds the save limit. The editable vector figure is retained.");
}

export function downloadFile(content, name, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportFigure(doc, format) {
  const name = (doc.title || "scientific-illustration").replace(/[<>:"/\\|?*]/g, "_");
  const svg = await exportSvg(doc);
  if (format === "svg") downloadFile(svg, `${name}.svg`, "image/svg+xml");
  else {
    const canvas = await rasterize(svg, doc.width * 2, doc.height * 2);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("PNG generation failed. Please retry or export SVG.");
    const bytes = embedPngMetadata(new Uint8Array(await blob.arrayBuffer()), {
      title: doc.title, schemaVersion: doc.version, assets: usedAssets(doc), attribution: creditsFor(doc),
    });
    downloadFile(new Blob([bytes], { type: "image/png" }), `${name}.png`);
  }
  // Both formats carry credits. A separate text download is explicitly available
  // in the credits panel, without relying on permission for multiple downloads.
}
