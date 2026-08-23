import { resolve } from "node:path";
import { defineConfig } from "vite-plus";

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      "modern-barcode-scanner": resolve(__dirname, "../../dist/index.js"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4174,
    strictPort: true,
    fs: {
      allow: [resolve(__dirname, "../..")],
    },
  },
  worker: {
    format: "es",
  },
});
