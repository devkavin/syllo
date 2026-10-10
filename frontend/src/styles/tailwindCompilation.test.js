// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { compile } from "@tailwindcss/node";
import postcss from "postcss";
import { expect, test } from "vitest";

test("compiles the app theme, class dark mode, Radix sizing, and hover utilities", async () => {
  const base = path.resolve("src");
  const compiler = await compile(await readFile(path.join(base, "index.css"), "utf8"), {
    base,
    onDependency() {},
  });
  const css = postcss.parse(compiler.build([
    "bg-background", "text-primary/80", "dark:bg-card", "hover:bg-accent",
    "rounded-xs", "rounded-lg", "font-serif", "max-h-(--radix-select-content-available-height)",
    "animate-accordion-down", "overline",
  ]));
  const rules = [];
  css.walkRules(rule => rules.push(rule));
  const ruleFor = selector => rules.find(rule => rule.selector === selector);
  const declarations = rule => Object.fromEntries((rule?.nodes || [])
    .filter(node => node.type === "decl").map(node => [node.prop, node.value]));

  expect(declarations(ruleFor(".bg-background"))["background-color"]).toBe("hsl(var(--background))");
  expect(declarations(ruleFor(".text-primary\\/80")).color).toContain("hsl(var(--primary))");
  expect(declarations(ruleFor(".dark\\:bg-card:where(.dark, .dark *)"))["background-color"])
    .toBe("hsl(var(--card))");
  const hoverRule = ruleFor(".hover\\:bg-accent:hover");
  expect(declarations(hoverRule)["background-color"]).toBe("hsl(var(--accent))");
  expect(hoverRule.parent.name).toBe("media");
  expect(hoverRule.parent.params).toBe("(hover: hover)");
  expect(declarations(ruleFor(".rounded-xs"))["border-radius"]).toBe("calc(var(--radius) - 4px)");
  expect(declarations(ruleFor(".rounded-lg"))["border-radius"]).toBe("var(--radius)");
  expect(declarations(ruleFor(".font-serif"))["font-family"]).toContain("Bricolage Grotesque");
  expect(declarations(ruleFor(".max-h-\\(--radix-select-content-available-height\\)"))["max-height"])
    .toBe("var(--radix-select-content-available-height)");
  expect(declarations(ruleFor(".animate-accordion-down")).animation).toContain("accordion-down");
  expect(ruleFor(".overline")).toBeUndefined();
});
