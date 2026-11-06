import { describe, expect, it, vi } from "vitest";
import { sanitizeAssetSvg, exportSvg, generatePreview } from "./export";
import { createDocument, createObject } from "./document";
import { templates, instantiateTemplate } from "./templates";

describe("scientific vectors and templates", () => {
  it("exports visible artwork with its correct vector and follows bound targets", async () => {
    const doc = createDocument();
    const hidden = createObject("asset", { assetId: "mitochondrion", hidden: true });
    const target = createObject("asset", { assetId: "dna-double-helix", x: 350, y: 160, width: 100, height: 80 });
    const line = createObject("arrow", { startBinding: { objectId: target.id, anchor: "right" }, x: 500, y: 200 });
    doc.objects = [hidden, target, line, createObject("text", { text: "Hidden annotation", isLabel: true })];
    doc.showLabels = false;
    const loadAsset = vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg"><path d="M1 1L10 10"/></svg>');
    const svg = await exportSvg(doc, { loadAsset });
    expect(loadAsset).toHaveBeenCalledExactlyOnceWith("dna-double-helix");
    expect(svg).not.toContain("Hidden annotation");
    expect(svg).toContain("translate(450 200)");
    expect(svg).toContain("CC0-1.0");
  });
  it("reduces a dense PNG preview to the server byte budget", async () => {
    const OriginalURL = URL;
    vi.stubGlobal("URL", class extends OriginalURL { static createObjectURL() { return "blob:test"; } static revokeObjectURL() {} });
    vi.stubGlobal("Image", class { set src(value) { this.onload(); } });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage() {} });
    const encode = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function () { return "data:image/png;base64," + "a".repeat(this.width > 420 ? 190000 : 100000); });
    try {
      expect((await generatePreview(createDocument())).length).toBeLessThanOrEqual(180000);
      expect(encode.mock.calls.length).toBeGreaterThan(1);
    } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
  });
  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.test/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://evil.test)"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x "unsafe">]><svg xmlns="http://www.w3.org/2000/svg"/>',
  ])("rejects unsafe vector input", source => expect(() => sanitizeAssetSvg(source)).toThrow());
  it("exports self-contained vectors, escaped notation and attribution", async () => {
    const doc = createDocument("<Respiration>");
    doc.objects = [createObject("asset", { assetId: "mitochondrion" }), createObject("text", { text: "H₂O < NAD⁺ & Δψ" })];
    const svg = await exportSvg(doc, { loadAsset: async () => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><path d="M0 0L20 10"/></svg>' });
    expect(svg).toContain('<path d="M0 0L20 10"');
    expect(svg).toContain("H₂O &lt; NAD⁺ &amp; Δψ");
    expect(svg).toContain("jaiganesh"); expect(svg).toContain("CC0-1.0");
    expect(svg).not.toMatch(/<image|javascript:|foreignObject/);
    expect(new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror")).toBeNull();
  });
  it("does not silently export a missing scientific asset", async () => {
    const doc = createDocument(); doc.objects = [createObject("asset", { assetId: "removed-asset" })];
    await expect(exportSvg(doc)).rejects.toThrow();
  });
  it("creates independently editable ETC copies with correct transport directions", () => {
    const template = templates[0], a = instantiateTemplate(template.id), b = instantiateTemplate(template.id);
    expect(template.reviewStatus).toBe("draft"); expect(template.attribution.length).toBeGreaterThan(0);
    expect(a.id).not.toBe(b.id); expect(a.objects[0].id).not.toBe(b.objects[0].id);
    expect(a.objects.filter(o => o.assetId?.startsWith("etc-complex-"))).toHaveLength(4);
    for (const role of ["pump-i", "pump-iii", "pump-iv"]) expect(a.objects.find(o => o.role === role).flipY).toBe(true);
    expect(a.objects.some(o => o.role === "pump-ii")).toBe(false);
    expect(a.objects.find(o => o.role === "proton-return").flipY).toBe(false);
    expect(a.objects.find(o => o.role === "electron-i-to-q-horizontal").y).toBeLessThan(a.objects.find(o => o.assetId === "etc-complex-ii").y);
    expect(a.objects.some(o => o.text?.includes("ADP + Pᵢ → ATP"))).toBe(true);
  });
});
