import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";
import type { Env } from "../index";

// Make `env` from "cloudflare:test" carry our real bindings plus the
// migrations array injected in vitest.config.ts.
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}
