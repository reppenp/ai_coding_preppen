# Build Plan

_This file is the phased build plan for the project. It's the bridge between `docs/PRD.md` (what to build) + `docs/DESIGN.md` (what it looks like) and the actual code. Fill it out with the `build-plan` skill after the PRD and design brief are stable. Re-run the skill whenever reality has diverged from the plan._

> **Status:** Draft
> **Last updated:** 2026-05-16
> **Current phase:** Phase 2 (Phases 0–1 complete)

---

## Why a build plan exists

Claude Code sessions have a finite context window. The cheaper a session is to start, the better the work tends to be. A good build plan slices the project into phases where each phase:

- Has a single user-visible outcome.
- Touches a bounded set of files.
- Names exactly which docs and files Claude should load to execute it.
- Leaves the repo in a clean, testable state at the end.

That way each phase fits in a focused session — no full-repo loads, no thrashing, no context exhaustion mid-implementation.

---

## Strategy

- **Slicing principle:** Vertical slices by user story — each phase ships one story (or two tightly coupled stories) end-to-end: schema + API + UI together.
- **Critical path:** Phase 0 (scaffolding) and Phase 1 (order creation + dashboard) unblock everything. Nothing else can be built until an inspection order exists in D1.
- **What was deferred:** Photo uploads (Phase 3) are split from the inspection form (Phase 2) because R2 integration is a distinct risk — the form can be built and tested without it. Auth is out of scope for v1 per PRD §6.
- **Session boundaries:** `/clear` Claude's context at the start of each phase. Load only what `Context to load` specifies — not the whole repo.

---

## Phases

### Phase 0 — Scaffolding

**Goal:** Cloudflare Workers + D1 + Pages wired up, deploy pipeline working, smoke test green.

**Context to load:** `CLAUDE.md`, `docs/PRD.md` §7 (technical shape + CF stack table), `docs/DESIGN.md` §3 (component approach).

**Files this phase creates/modifies:**
- `wrangler.toml` — Workers + D1 + R2 bindings declared
- `package.json` — dependencies (Hono, Vitest, @cloudflare/vitest-pool-workers, React, Tailwind, Headless UI, Heroicons)
- `src/index.ts` — Hono app, single health-check route
- `src/db/schema.sql` — D1 schema: `inspections`, `form_responses`, `decisions` tables
- `vitest.config.ts` — test config with Workers pool
- `src/index.test.ts` — smoke test: GET /health returns 200

**Tests this phase adds:**
- `GET /health → 200` smoke test

**Done-when:**
- [x] `npm test` passes.
- [x] `wrangler dev` starts without errors. _(Verified via vitest-pool-workers running the Worker in the workerd/miniflare runtime + a successful production deploy serving 200 — no literal `wrangler dev` session was run.)_
- [x] `wrangler deploy` produces a public URL. → https://ai-coding-preppen.pjreppen.workers.dev
- [x] URL is in `README.md`.
- [x] D1 schema is migrated locally (`wrangler d1 migrations apply`).

**Session budget:** ~1 session.

**Risks / unknowns:** First-time Cloudflare Pages + Workers setup can have wiring surprises (Pages Functions vs. standalone Workers). Confirm the deployment model before writing app code.

---

### Phase 1 — Order creation + status dashboard

**Goal:** Jeff can create an inspection order and all three users can see the full order list with status on a shared dashboard.

**Context to load:** `CLAUDE.md`, `docs/PRD.md` §4 stories 1 & 5, `docs/DESIGN.md` §2 (IA + hero screen) & §4 (visual tokens), `src/db/schema.sql`, `src/index.ts`.

**Files this phase creates/modifies:**
- `src/db/schema.sql` — finalize `inspections` table if needed
- `src/routes/orders.ts` — `POST /api/orders` (create), `GET /api/orders` (list with status)
- `src/routes/orders.test.ts` — API tests for create + list
- `src/client/pages/Dashboard.tsx` — order list table with status badges, cycle time column
- `src/client/pages/NewOrder.tsx` — order creation form (insured details, property info, contact)
- `src/client/components/StatusBadge.tsx` — color + text badge for order status
- `src/client/components/Nav.tsx` — top nav with Dashboard / Orders tabs

**Tests this phase adds:**
- `POST /api/orders` creates a record in D1, returns 201 with the new order ID
- `GET /api/orders` returns a list with status and created_at for each order
- Dashboard renders the order list (component test)
- NewOrder form submits and redirects to Dashboard (component test)

**Done-when:**
- [x] Jeff can fill out the New Order form and submit it. _(NewOrder.tsx → POST /api/orders → redirect; covered by NewOrder.test.tsx)_
- [x] The Dashboard shows the new order with status "Ordered" and a created date. _(Dashboard.tsx TanStack table + StatusBadge; covered by Dashboard.test.tsx)_
- [x] All three API tests pass. _(orders.test.ts: create→201/id, missing-required→400, list→status+created_at; +2 extra: persisted status, invalid source)_
- [x] `npm test` passes. _(10/10 across workers + client projects; `npm run typecheck` and `npm run build` also green)_

**Session budget:** 1–2 sessions.

**Risks / unknowns:** Status enum design — define all valid statuses upfront (Ordered → In Progress → Submitted → Reviewed) to avoid a migration mid-build. _Resolved: enum was already fixed in Phase 0's schema; no migration needed for it. A separate `property_use` gap (PRD §4 story 1) required migration `0002`._

---

### Phase 2 — Inspection form (field submission)

**Goal:** John can open an assigned inspection order, complete all four sections of the structured form, save progress mid-inspection, and submit. Order status updates to "Submitted."

**Context to load:** `CLAUDE.md`, `docs/PRD.md` §4 story 2, §5 (form structure), §7 (draft/save behavior), `docs/DESIGN.md` §2 & §3, `src/routes/orders.ts`, `src/db/schema.sql`.

**Files this phase creates/modifies:**
- `src/db/schema.sql` — `form_responses` ALREADY EXISTS (created in Phase 0 as one row per inspection with provisional typed columns, `UNIQUE(inspection_id)`). This phase ALTERs it to the finalized field list — see Risks below.
- `src/routes/forms.ts` — `GET /api/orders/:id/form` (load saved state), `PUT /api/orders/:id/form` (auto-save per section), `POST /api/orders/:id/submit` (final submit)
- `src/routes/forms.test.ts` — API tests for load, save, submit
- `src/client/pages/InspectionForm.tsx` — 4-section stepped form with progress indicator
- `src/client/components/FormSection.tsx` — reusable section wrapper (title, fields, save state)
- `src/client/components/ProgressIndicator.tsx` — shows which of 4 sections are complete

**Tests this phase adds:**
- `PUT /api/orders/:id/form` saves section data to D1, returns 200
- `GET /api/orders/:id/form` returns previously saved section data
- `POST /api/orders/:id/submit` marks order as "Submitted" in `inspections` table
- Form renders all four sections with correct fields (component test)
- Partially saved form reloads saved state on page refresh (component test)

**Done-when:**
- [ ] John can open an order, fill in fields across all 4 sections, and submit.
- [ ] Refreshing the page mid-inspection reloads the saved state.
- [ ] Order status changes to "Submitted" on the Dashboard after submit.
- [ ] All form API tests pass.
- [ ] `npm test` passes.

**Session budget:** 2 sessions.

**Risks / unknowns:** Auto-save strategy — debounce on field blur vs. explicit "Save section" button. The PRD says save must not lose work on connectivity loss; consider explicit save button per section to make the save state obvious to John.

**⚠️ Prerequisite — KNOWN DEBT carried from Phase 0:** `form_responses`' columns are provisional best-guesses off PRD §5 topics (see the ⚠️ block atop `src/db/schema.sql`). **PRD §8 Risk 4 (define required vs. optional form fields) is still OPEN and MUST be resolved before this phase's form work** — otherwise the field list, column names/types, and required flags are guesses. Expect `ALTER TABLE` migrations (new numbered migration files, not edits to `0001`) once the real fields are defined.

---

### Phase 3 — Photo attachments

**Goal:** John can attach photos to each section of the inspection form; photos are stored in R2 and linked to their section in D1.

**Context to load:** `CLAUDE.md`, `docs/PRD.md` §4 story 6, §7 (photo handling), `docs/DESIGN.md` §3 (custom components — file uploader), `src/routes/forms.ts`, `src/db/schema.sql`.

**Files this phase creates/modifies:**
- `src/db/schema.sql` — `photos` table (order_id, section, r2_key, uploaded_at)
- `src/routes/photos.ts` — `POST /api/orders/:id/photos` (upload to R2, write record to D1), `GET /api/orders/:id/photos` (list by section)
- `src/routes/photos.test.ts` — API tests for upload + list
- `src/client/components/PhotoUploader.tsx` — drag-and-drop + click-to-browse input, per-section, shows upload progress
- `src/client/pages/InspectionForm.tsx` — add PhotoUploader to each FormSection

**Tests this phase adds:**
- `POST /api/orders/:id/photos` writes to R2 and inserts a record in D1, returns 201 with r2_key
- `GET /api/orders/:id/photos` returns photo list grouped by section
- PhotoUploader renders, accepts a file, and fires the upload handler (component test)

**Done-when:**
- [ ] John can drag-and-drop or browse to attach a photo to any section.
- [ ] Photos appear in the section after upload (no page refresh needed).
- [ ] Photos are stored in R2; keys are recorded in D1.
- [ ] All photo API tests pass.
- [ ] `npm test` passes.

**Session budget:** 1–2 sessions.

**Risks / unknowns:** R2 presigned URL vs. proxied upload through the Worker — decide before coding. Proxied upload is simpler but adds CPU time and Worker size pressure; presigned URL is better long-term but requires more setup. Flag if file sizes exceed Worker request limits.

---

### Phase 4 — Review queue + underwriting decision + cycle time

**Goal:** Kelly has a queue of submitted inspections, can add notes and record a decision. Cycle time (order created → decision recorded) is visible to all users on the Dashboard.

**Context to load:** `CLAUDE.md`, `docs/PRD.md` §4 stories 3 & 4, `docs/DESIGN.md` §2 (IA — Review Queue screen) & §4 (visual tokens), `src/routes/orders.ts`, `src/db/schema.sql`.

**Files this phase creates/modifies:**
- `src/db/schema.sql` — `decisions` table (order_id, notes, premium_direction, policy_action, decided_at)
- `src/routes/decisions.ts` — `POST /api/orders/:id/decision` (record decision, update order status to "Reviewed"), `GET /api/orders/:id/decision` (load existing decision)
- `src/routes/decisions.test.ts` — API tests for record + load
- `src/client/pages/ReviewQueue.tsx` — table of submitted inspections, link to each
- `src/client/pages/ReviewDetail.tsx` — full inspection report view + decision form (notes, premium direction, policy action)
- `src/routes/orders.ts` — update `GET /api/orders` to return `cycle_time_days` (decided_at - created_at)
- `src/client/pages/Dashboard.tsx` — add cycle time column

**Tests this phase adds:**
- `POST /api/orders/:id/decision` records decision in D1, sets order status to "Reviewed"
- `GET /api/orders` returns `cycle_time_days` for completed orders
- ReviewQueue renders only "Submitted" orders (component test)
- ReviewDetail renders inspection form data read-only + decision form (component test)

**Done-when:**
- [ ] Kelly sees only "Submitted" orders in the Review Queue.
- [ ] Kelly can add notes, select premium direction and policy action, and submit a decision.
- [ ] Order status changes to "Reviewed" on the Dashboard after decision.
- [ ] Cycle time (days) is visible on the Dashboard for completed inspections.
- [ ] All decision API tests pass.
- [ ] `npm test` passes.

**Session budget:** 1–2 sessions.

**Risks / unknowns:** ReviewDetail needs to render the full inspection form data read-only — reuse FormSection components in read-only mode to avoid duplicating the form structure.

---

## Decision log

| Date | Phase touched | Change | Reason |
|---|---|---|---|
| 2026-05-12 | — | Initial plan | PRD and DESIGN.md complete; starting from scratch |
| 2026-05-16 | Phase 1 | Added frontend build pipeline (Vite, Tailwind/PostCSS, index.html, main.tsx, react-router-dom) — not in original file list | Phase 0 scaffolded only the Worker; the SPA had no build at all. Prerequisite for any UI phase. |
| 2026-05-16 | Phase 1 | Added `react-router-dom` (runtime dep) | Routing across `/`, `/orders/new`; `/orders/:id` & `/review` stubbed for Phases 2/4. Approved by developer. |
| 2026-05-16 | Phase 1 | Split tests into a vitest **workspace**: `workers` (pool) + `client` (jsdom). Added @testing-library/* + jsdom dev deps | The Workers pool can't render React; component tests in BUILDPLAN need a DOM. Approved by developer. |
| 2026-05-16 | Phase 1 / Phase 2 | Migration `0002` adds `inspections.property_use` (nullable) | PRD §4 story 1 requires "property use"; Phase 0 schema omitted it. DB stays permissive (PRD §8 Risk 4 still open); form requires it at UI layer. |

---

## Handoff notes

_What state should the repo be in when this plan is "done"?_

- Public URL deployed and linked from README.
- All Must-have user stories from PRD.md §4 (stories 1–5) have green tests.
- Story 6 (photos) has green tests.
- Architecture diagram regenerated and committed.
- Demo video and PRD video linked from README.
