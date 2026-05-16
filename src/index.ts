import { Hono } from "hono";

/**
 * Cloudflare bindings available to the Worker. Declared in wrangler.toml.
 * R2 (PHOTOS) is added in Phase 3 once the token has the r2 scope.
 */
export interface Env {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Env }>();

// Smoke-test route. Phase 0's only endpoint — proves the deploy pipeline works
// end to end before any feature code lands.
app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
