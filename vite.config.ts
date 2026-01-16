import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
	plugins: [
		react(),
		dts({
			insertTypesEntry: true,
			include: ["src"],
			exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "demo"],
		}),
	],
	server: {
		port: 8080,
		strictPort: true,
		host: true,
		cors: true,
		allowedHosts: true, // To allow any host to access your server
	},
	css: {
		// Process CSS files
	},
	// Exclude zbar-wasm from dependency optimization to ensure WASM files load correctly
	optimizeDeps: {
		exclude: ["@undecaf/zbar-wasm"],
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
		minify: "esbuild",
		copyPublicDir: false,
	},
	worker: {
		format: "es",
	},
});
