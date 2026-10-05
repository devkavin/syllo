// @vitest-environment node
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { prerenderHome } from "./prerender-home";
const readFile = vi.fn();
const writeFile = vi.fn();
const createServer = vi.fn();
const dependencies = { fs: { readFile, writeFile }, createServer };

describe("homepage prerender hook without running a build", () => {
  it("writes readable homepage HTML and a separate empty app shell", async () => {
    readFile.mockResolvedValue('<html><link rel="canonical" href="https://syllo.kavinhq.com/" /><div id="root"></div></html>');
    writeFile.mockReset();
    const close = vi.fn();
    createServer.mockResolvedValue({ ssrLoadModule: async () => ({ default: () => React.createElement("main", null, "Make your time count") }), close });
    const plugin = prerenderHome(dependencies);
    plugin.configResolved({ root: "/test", build: { outDir: "dist" } });
    await plugin.closeBundle();
    expect(writeFile.mock.calls[0][1]).toContain('<div id="root"></div>');
    expect(writeFile.mock.calls[0][1]).not.toContain('rel="canonical"');
    expect(writeFile.mock.calls[1][1]).toContain("<main>Make your time count</main>");
    expect(createServer.mock.calls[0][0].server.middlewareMode).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });
  it("closes the non-listening rendering server if rendering fails", async () => {
    readFile.mockResolvedValue('<div id="root"></div>');
    const close = vi.fn();
    createServer.mockResolvedValue({ ssrLoadModule: async () => { throw new Error("Bad component"); }, close });
    const plugin = prerenderHome(dependencies);
    plugin.configResolved({ root: "/test", build: { outDir: "dist" } });
    await expect(plugin.closeBundle()).rejects.toThrow("Bad component");
    expect(close).toHaveBeenCalledOnce();
  });
});
