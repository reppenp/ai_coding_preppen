import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds ONLY the React SPA (the Worker is bundled by Wrangler from
// src/index.ts, not Vite). Output goes to dist/client, which wrangler.toml's
// [assets] binding serves. Vitest uses vitest.config.ts / vitest.workspace.ts,
// not this file, so the two build systems stay isolated.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});
