import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export function offlineShell() {
  return {
    name: "syllo-offline-shell",
    apply: "build",
    async generateBundle(_options, bundle) {
      // Cache the app entry and note editor's dependency graph, not every page.
      const files = new Set(["/app.html", "/app.webmanifest", "/syllo-icon.svg"]);
      const visited = new Set();
      const dynamicVisited = new Set();
      const include = (filename, withDynamic = false) => {
        const item = bundle[filename];
        if (!item) return;
        const dynamic = withDynamic && item.type === "chunk" && !item.isEntry;
        if (visited.has(filename) && (!dynamic || dynamicVisited.has(filename))) return;
        visited.add(filename);
        if (dynamic) dynamicVisited.add(filename);
        files.add(`/${filename}`);
        if (item.type === "chunk") {
          for (const dependency of item.imports) include(dependency, dynamic);
          if (dynamic) for (const dependency of item.dynamicImports) include(dependency, true);
          for (const asset of item.viteMetadata?.importedCss || []) include(asset);
          for (const asset of item.viteMetadata?.importedAssets || []) include(asset);
        }
      };
      let notebookFound = false;
      for (const item of Object.values(bundle)) if (item.type === "chunk") {
        if (item.isEntry) include(item.fileName);
        if (item.name === "Notebooks" || /[\\/]pages[\\/]Notebooks\.jsx(?:\?|$)/.test(item.facadeModuleId || "")) { notebookFound = true; include(item.fileName, true); }
      }
      if (!notebookFound) throw new Error("Offline build is missing the notebook editor chunk");
      // KaTeX fonts are referenced from extracted CSS, rather than JS imports.
      for (const item of Object.values(bundle)) if (item.type === "asset" && /KaTeX_.*\.(woff2?|ttf)$/.test(item.fileName)) include(item.fileName);
      const urls = [...files].sort();
      const version = createHash("sha256").update(JSON.stringify(urls)).digest("hex").slice(0, 12);
      const source = (await readFile(new URL("../public/sw.js", import.meta.url), "utf8")).replace("__SYLLO_VERSION__", version).replace("__SYLLO_PRECACHE__", JSON.stringify(urls));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}
