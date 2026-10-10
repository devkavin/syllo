import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

export function prerenderHome(dependencies = {}) {
  let config;
  return {
    name: "syllo-prerender-home",
    apply: "build",
    configResolved(value) { config = value; },
    async closeBundle() {
      const { readFile, writeFile } = dependencies.fs || await import("node:fs/promises");
      const createServer = dependencies.createServer || (await import("vite")).createServer;
      const filename = path.resolve(config.root, config.build.outDir, "index.html");
      const original = await readFile(filename, "utf8");
      // App routes get an empty shell, not a flash of homepage content.
      await writeFile(path.join(path.dirname(filename), "app.html"), original.replace(/<link rel="canonical"[^>]*>/, ""));
      // This server only renders HTML; client dependency scanning can outlive it.
      const server = await createServer({ root: config.root, server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
      try {
        const { default: Home } = await server.ssrLoadModule("/src/pages/Home.jsx");
        const html = renderToStaticMarkup(React.createElement(Home));
        if (!original.includes('<div id="root"></div>')) throw new Error("Homepage root is missing");
        await writeFile(filename, original.replace('<div id="root"></div>', `<div id="root">${html}</div>`));
      } finally { await server.close(); }
    },
  };
}
