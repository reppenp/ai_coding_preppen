import { applyD1Migrations, env } from "cloudflare:test";

// Runs once per test file (before any test) inside the Workers runtime.
// applyD1Migrations tracks what it has already applied, so this is a no-op
// after the first call within an isolated-storage run.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
