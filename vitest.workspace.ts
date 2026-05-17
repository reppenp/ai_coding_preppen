import { defineWorkspace } from "vitest/config";

// Two isolated test projects:
//  - workers: API/Worker tests in the real Cloudflare runtime (D1 behaves
//    exactly as in production).
//  - client:  React component tests in jsdom.
// `npm test` runs both.
export default defineWorkspace([
  "./vitest.config.ts",
  "./vitest.client.config.ts",
]);
