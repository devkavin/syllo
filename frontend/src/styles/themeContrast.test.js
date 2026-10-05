import { readFileSync } from "node:fs";
import postcss from "postcss";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Validate the actual theme palette against contrast requirements, not exact colour choices.
const stylesheet = postcss.parse(readFileSync(resolve("src/index.css"), "utf8"));
function palette(selector) {
  const values = {};
  stylesheet.walkRules(selector, rule => rule.walkDecls(declaration => { values[declaration.prop] = declaration.value; }));
  return values;
}
function luminance(hsl) {
  const [hue, saturation, lightness] = hsl.split(/\s+/).map(value => parseFloat(value));
  const s = saturation / 100, l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = n => {
    const k = (n + hue / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  };
  return .2126 * channel(0) + .7152 * channel(8) + .0722 * channel(4);
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
describe.each([["light", ":root"], ["dark", ".dark"]])("%s theme contrast", (_name, selector) => {
  const tokens = palette(selector);
  it.each(["--background", "--card", "--paper"])("keeps secondary text readable on %s", surface => {
    expect(contrast(tokens["--muted-foreground"], tokens[surface])).toBeGreaterThanOrEqual(4.5);
  });
  it("keeps primary button text readable", () => {
    expect(contrast(tokens["--primary"], tokens["--primary-foreground"])).toBeGreaterThanOrEqual(4.5);
  });
  it("makes input boundaries distinguishable from their surface", () => {
    expect(contrast(tokens["--input"], tokens["--card"])).toBeGreaterThanOrEqual(3);
  });
});
