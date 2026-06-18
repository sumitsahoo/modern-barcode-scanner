import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Demo app config.
//
// The demo intentionally consumes the library the same way a published
// consumer does — by importing the package name (`modern-barcode-scanner`)
// and its stylesheet entry (`modern-barcode-scanner/styles.css`) rather than
// reaching into `../src` directly. The aliases below map those public entry
// points to the local source so the demo stays live-reloading during dev
// while still exercising the real public API surface.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "modern-barcode-scanner/styles.css",
        replacement: resolve(__dirname, "../src/styles.css"),
      },
      { find: /^modern-barcode-scanner$/, replacement: resolve(__dirname, "../src/index.ts") },
    ],
    // Match the library build: use the WASM-inlined zbar build (see ../vite.config.ts).
    conditions: ["zbar-inlined", "module", "browser", "development|production"],
  },
  worker: {
    format: "es",
  },
  server: {
    port: 8080,
    strictPort: true,
    host: true,
    cors: true,
    allowedHosts: true, // To allow any host to access your server
  },
});
