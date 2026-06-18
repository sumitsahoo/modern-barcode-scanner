import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

// Library build config. The demo has its own config (demo/vite.config.ts).
// Type declarations are emitted separately by `tsc` (see the `build` script).
export default defineConfig({
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    // typeAware keeps type-informed lint rules (e.g. no-floating-promises);
    // typeCheck is left off so the linter does not re-report raw tsc compiler
    // errors. Full type checking is done by `npm run typecheck` (tsc). This
    // also avoids a false "excessive stack depth" on the Vite config files,
    // caused by @vitejs/plugin-react (real `vite` types) and vite-plus-core
    // exposing two structurally-identical-but-distinct `PluginOption` types.
    options: { typeAware: true, typeCheck: false },
  },
  plugins: lazyPlugins(() => [react()]),
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
  test: {
    // Components and DOM-touching helpers need a browser-like environment.
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    restoreMocks: true,
  },
});
