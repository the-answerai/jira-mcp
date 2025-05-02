import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      // Build both the main server and the check-setup script
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        "scripts/check-setup": resolve(__dirname, "src/scripts/check-setup.ts"),
      },
      formats: ["es"],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      // Match external array from linear-mcp
      external: [
        "@modelcontextprotocol/sdk/server/index.js",
        "@modelcontextprotocol/sdk/server/stdio.js",
        "@modelcontextprotocol/sdk/types.js",
      ],
    },
    target: "node18", // Match linear-mcp
    outDir: "build", // Changed output directory
    sourcemap: true,
  },
  plugins: [dts()],
});
