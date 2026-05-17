import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

// Tests run inside the real Workers runtime (miniflare) via the Cloudflare
// pool, so the D1 binding and Hono behave exactly as they do in `wrangler dev`.
//
// The test D1 starts empty. We read the same migrations Wrangler applies and
// hand them to the runtime as a binding; a setup file applies them before
// each test file so every test sees the real schema.
export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations("./migrations");

  return {
    test: {
      name: "workers",
      // Worker/API tests only. Client *.test.tsx runs in the jsdom project
      // (vitest.client.config.ts) — the Workers pool can't render React.
      include: ["src/**/*.test.ts"],
      setupFiles: ["./src/test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
