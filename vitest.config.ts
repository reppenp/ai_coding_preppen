import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// Tests run inside the real Workers runtime (miniflare) via the Cloudflare
// pool, so the D1 binding and Hono behave exactly as they do in `wrangler dev`.
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
