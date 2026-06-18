import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Library build config. The demo has its own config (demo/vite.config.ts).
// Type declarations are emitted separately by `tsc` (see the `build` script).
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Pull in the `zbar.wasm`-inlined build of @undecaf/zbar-wasm so the WASM
    // binary is embedded as data instead of fetched from a sibling file. This
    // is required because the scanner worker is inlined as a Blob (see
    // useScanner.ts) and a Blob worker has no base URL to resolve assets from.
    conditions: ["zbar-inlined", "module", "browser", "development|production"],
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "ModernBarcodeScanner",
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
        },
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
    minify: "oxc",
    copyPublicDir: false,
  },
  worker: {
    format: "es",
  },
});
