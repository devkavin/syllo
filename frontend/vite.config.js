import path from "node:path";
import { defineConfig } from "vitest/config";
import { transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { prerenderHome } from "./scripts/prerender-home.js";

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
  },
});
