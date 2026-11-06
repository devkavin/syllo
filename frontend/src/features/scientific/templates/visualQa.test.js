import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { templates } from "../templates.js";
import { exportSvg } from "../export";
import { assetById } from "../document";

const assets = resolve(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const loadAsset = async id => readFileSync(resolve(assets, assetById[id].file), "utf8");

it("exports every real scientific template with self-contained vectors and complete credits", async () => {
  for (const item of templates) {
    const svg = await exportSvg(item.document, { loadAsset });
    const root = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(root.querySelector("parsererror"), item.id).toBeNull();
    expect(root.querySelectorAll("image"), item.id).toHaveLength(0);
    expect(root.querySelector("path"), item.id).not.toBeNull();
    expect(root.querySelector("metadata").textContent, item.id).toContain("attribution");
    const ids = [...root.querySelectorAll("[id]")].map(node => node.id);
    expect(new Set(ids).size, item.id).toBe(ids.length);
    if (item.document.objects.some(obj => obj.isLabel)) {
      const hidden = new DOMParser().parseFromString(await exportSvg({ ...item.document, showLabels: false }, { loadAsset }), "image/svg+xml");
      expect(hidden.querySelectorAll("text").length, item.id).toBeLessThan(root.querySelectorAll("text").length);
    }
  }
}, 15000);
