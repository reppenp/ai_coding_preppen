import { Hono } from "hono";
import orders from "./routes/orders";

/**
 * Cloudflare bindings available to the Worker. Declared in wrangler.toml.
 * R2 (PHOTOS) is added in Phase 3 once the token has the r2 scope.
 */
export interface Env {
  DB: D1Database;
  // Static SPA assets (Phase 1). Workers serves a built file if one matches
  // the path, otherwise falls through to this Worker; unmatched non-API paths
  // fall back to index.html (single-page-application mode in wrangler.toml).
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

// Smoke-test route. Phase 0's only endpoint — proves the deploy pipeline works
// end to end before any feature code lands.
app.get("/health", (c) => c.json({ status: "ok" }));

// Feature API. Everything the SPA talks to lives under /api.
app.route("/api/orders", orders);

export default app;
