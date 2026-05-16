import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "./index";

describe("health check", () => {
  it("GET /health → 200", async () => {
    const ctx = createExecutionContext();
    const res = await app.fetch(
      new Request("http://localhost/health"),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
