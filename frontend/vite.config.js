import path from "node:path";
import { defineConfig } from "vitest/config";
import { transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { prerenderHome } from "./scripts/prerender-home.js";
import { offlineShell } from "./scripts/offline-shell.js";

export default defineConfig({
  plugins: [
    {
      name: "syllo-jsx-in-js",
      enforce: "pre",
      async transform(code, id) {
        if (/\/src\/.*\.js$/.test(id)) {
          return transformWithEsbuild(code, id, { loader: "jsx", jsx: "automatic" });
        }
        return null;
      },
    },
    react(),
    tailwindcss(),
    prerenderHome(),
    offlineShell(),
  ],
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.jsx?$/,
  },
  optimizeDeps: {
    esbuildOptions: { loader: { ".js": "jsx" } },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    server: { deps: { inline: ["@blocknote/math-block", "@blocknote/diagram-block"] } },
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, "/");
          if (normalized.includes("features/scientific/catalog.json")) return "scientific-catalog";
          if (!normalized.includes("node_modules")) return undefined;
          if (normalized.includes("@blocknote/math-block") || normalized.includes("/katex/")) return "math-vendor";
          if (normalized.includes("/prosemirror-") || normalized.includes("/@tiptap/") || normalized.includes("/@blocknote/core/")) return "editor-core";
          if (normalized.includes("/@radix-ui/") || normalized.includes("/lucide-react/")) return "ui-vendor";
          return undefined;
        },
      },
    },
  },
});
