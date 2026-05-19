import { Hono } from "hono";
import orders from "./routes/orders";
import forms from "./routes/forms";

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

// Feature API. Everything the SPA talks to lives under /api. `orders` owns
// the collection routes (/api/orders); `forms` owns the per-order inspection
// routes (/api/orders/:id/form, /:id/submit). No path overlap between them.
app.route("/api/orders", orders);
app.route("/api/orders", forms);

export default app;
