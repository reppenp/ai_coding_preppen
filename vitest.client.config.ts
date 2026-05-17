import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// React component tests. Plain jsdom + Testing Library — deliberately NOT the
// Workers pool (that runtime has no DOM). Scoped to *.test.tsx under
// src/client so it never picks up the Worker/API tests.
export default defineConfig({
  plugins: [react()],
  test: {
    name: "client",
    environment: "jsdom",
    include: ["src/client/**/*.test.tsx"],
    setupFiles: ["./src/test/setup-client.ts"],
  },
});
