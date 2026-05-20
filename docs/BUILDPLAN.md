# Build Plan

_This file is the phased build plan for the project. It's the bridge between `docs/PRD.md` (what to build) + `docs/DESIGN.md` (what it looks like) and the actual code. Fill it out with the `build-plan` skill after the PRD and design brief are stable. Re-run the skill whenever reality has diverged from the plan._

> **Status:** Draft
> **Last updated:** 2026-05-19
> **Current phase:** Phase 4 complete (Phases 0–4 done). All Must-have stories (PRD §4 stories 1–5) plus Should story 6 (photos) have green tests — 64/64 across workers + client; `npm run typecheck` and `npm run build` also green. Migration `0005_finalize_decisions` applied to local D1 — **remote D1 still needs `npm run db:migrate:remote`** before the next deploy. Repo otherwise deployable; `npm run deploy` not yet run.

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
- [x] John can open an order, fill in fields across all 4 sections, and submit. _(InspectionForm.tsx: stepped 4-section form + ProgressIndicator + per-section FormSection; route `/orders/:id` wired in main.tsx. Dashboard insured-name cells now link to `/orders/:id` so John reaches the form by clicking.)_
- [x] Refreshing the page mid-inspection reloads the saved state. _(GET /api/orders/:id/form on mount → normalized into controls; covered by InspectionForm.test.tsx "reloads previously saved state".)_
- [x] Order status changes to "Submitted" on the Dashboard after submit. _(submitForm → navigate("/"); Dashboard reads status from GET /api/orders. Status badge also reflects Ordered → In Progress in the form header after first save.)_
- [x] All form API tests pass. _(forms.test.ts: 13/13.)_
- [x] `npm test` passes. _(28/28 across workers + client; `npm run typecheck` and `npm run build` also green.)_

**Scope note:** `Dashboard.tsx` (not in this phase's original file list) got one change — the insured-name cell is now a `<Link>` to `/orders/:id` so John can actually reach the form. Approved by the developer in-session. Logged below.

**Session budget:** 2 sessions.

**Risks / unknowns:** Auto-save strategy — debounce on field blur vs. explicit "Save section" button. The PRD says save must not lose work on connectivity loss; consider explicit save button per section to make the save state obvious to John.

**✅ Prerequisite RESOLVED 2026-05-19 — PRD §8 Risk 4 closed:** the canonical `form_responses` field list, types, and the 8-field required-to-submit set are now defined in **PRD §5** (resolved via a field-by-field developer interview). "Required" is an API/UI submit-gate, not a DB constraint — every column stays nullable per Risk 1. The migration aligning `form_responses` to that spec is a new numbered file (not an edit to `0001`/`0002`); see the Decision log row below. Form work in this phase MUST follow PRD §5, not the old provisional column guesses.

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
- [x] John can drag-and-drop or browse to attach a photo to any section. _(PhotoUploader.tsx: drop zone + keyboard-accessible `<input type=file>` / "Choose photos" button, mounted per active section in InspectionForm.tsx scoped to `active + 1`.)_
- [x] Photos appear in the section after upload (no page refresh needed). _(uploadPhoto → returned Photo appended to state; covered by PhotoUploader.test.tsx "shows the photo without a refresh".)_
- [x] Photos are stored in R2; keys are recorded in D1. _(POST proxies bytes → `env.PHOTOS.put`, then inserts the `photos` row with `r2_key`; photos.test.ts asserts the bytes are retrievable from the R2 binding under the returned key.)_
- [x] All photo API tests pass. _(photos.test.ts: 9/9 — upload 201/r2_key, 404/400 guards, grouped list, raw byte stream.)_
- [x] `npm test` passes. _(41/41 across workers + client; `npm run typecheck` and `npm run build` also green; migration 0004 applied to local D1.)_

**Session budget:** 1–2 sessions.

**Risks / unknowns:** R2 presigned URL vs. proxied upload through the Worker — decide before coding. Proxied upload is simpler but adds CPU time and Worker size pressure; presigned URL is better long-term but requires more setup. Flag if file sizes exceed Worker request limits. _Resolved: **proxied** chosen — v1 is a handful of phone photos per section, uploaded per-section (PRD §7); one atomic retryable request fits John's poor-connectivity field work (Risk 1) with no presign-expiry to manage. Implementation guards proxied size at 15 MB (PRD §7 sets no product limit); revisit presigned only if real usage needs larger files. **Deploy prerequisite (open):** the OAuth token still lacks the `r2` scope — tests run on simulated R2, but remote `wrangler deploy` needs re-auth-with-R2 or a dashboard-created bucket first._

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
- [x] Kelly sees only "Submitted" orders in the Review Queue. _(ReviewQueue.tsx filters `orders.status === "Submitted"`; ReviewQueue.test.tsx asserts Ordered / In Progress / Reviewed are excluded.)_
- [x] Kelly can add notes, select premium direction and policy action, and submit a decision. _(ReviewDetail.tsx: two radio-group fieldsets + notes textarea + Record-decision button; POST /api/orders/:id/decision; ReviewDetail.test.tsx covers happy path, missing-required guard, and pre-fill from existing decision.)_
- [x] Order status changes to "Reviewed" on the Dashboard after decision. _(decisions.ts: `UPDATE inspections SET status = 'Reviewed', decided_at = datetime('now')`; decisions.test.ts asserts both the status and decided_at after POST.)_
- [x] Cycle time (days) is visible on the Dashboard for completed inspections. _(orders.ts computes `cycle_time_days` server-side as `CAST(MAX(0, ROUND(julianday(decided_at) - julianday(created_at))) AS INTEGER)`; Dashboard renders the field; orders.test.ts asserts null pre-decision and the integer day count after.)_
- [x] All decision API tests pass. _(decisions.test.ts: 12/12.)_
- [x] `npm test` passes. _(64/64 across workers + client; `npm run typecheck` and `npm run build` also green.)_

**Session budget:** 1–2 sessions.

**Risks / unknowns:** ReviewDetail needs to render the full inspection form data read-only — reuse FormSection components in read-only mode to avoid duplicating the form structure. _Resolved: the **field spec** was extracted to `src/client/form-spec.ts` (SECTIONS / FieldDef / normalizeLoaded / formatValue). FormSection itself is editor-specific (save-state footer, dirty/saving/error pill), so the read-only report uses a plain `<dl>` per section that consumes the same spec. The shared piece is the data, not the wrapper — neither view can drift from the other on field add/rename._

---

## Decision log

| Date | Phase touched | Change | Reason |
|---|---|---|---|
| 2026-05-12 | — | Initial plan | PRD and DESIGN.md complete; starting from scratch |
| 2026-05-16 | Phase 1 | Added frontend build pipeline (Vite, Tailwind/PostCSS, index.html, main.tsx, react-router-dom) — not in original file list | Phase 0 scaffolded only the Worker; the SPA had no build at all. Prerequisite for any UI phase. |
| 2026-05-16 | Phase 1 | Added `react-router-dom` (runtime dep) | Routing across `/`, `/orders/new`; `/orders/:id` & `/review` stubbed for Phases 2/4. Approved by developer. |
| 2026-05-16 | Phase 1 | Split tests into a vitest **workspace**: `workers` (pool) + `client` (jsdom). Added @testing-library/* + jsdom dev deps | The Workers pool can't render React; component tests in BUILDPLAN need a DOM. Approved by developer. |
| 2026-05-16 | Phase 1 / Phase 2 | Migration `0002` adds `inspections.property_use` (nullable) | PRD §4 story 1 requires "property use"; Phase 0 schema omitted it. DB stays permissive (PRD §8 Risk 4 still open); form requires it at UI layer. |
| 2026-05-19 | Phase 2 | **Risk 4 resolved.** Canonical form field list + 8-field required-to-submit set defined (PRD §5) via field-by-field developer interview. Migration `0003_finalize_form_responses` aligns `form_responses` to it. | Phase 2 prerequisite. Provisional Phase-0 columns replaced by a defined spec; "required" is an API/UI submit-gate, columns stay nullable per Risk 1. |
| 2026-05-19 | Phase 2 | Phase 2 UI built. Auto-save risk resolved in favour of **explicit per-section "Save section"** (not blur-debounce). `api.ts` extended with `loadForm`/`saveFormSection`/`submitForm` (not in the file list — follows the existing thin-wrapper precedent). | Explicit save maps 1:1 to PUT .../form and makes save state obvious to John in poor connectivity (PRD §8 Risk 1) — the option the phase's risk note recommended. |
| 2026-05-19 | Phase 2 | `Dashboard.tsx` insured-name cell made a `<Link>` to `/orders/:id` (file outside the phase's list). Dashboard tests wrapped in `MemoryRouter` + a link-href assertion added. | Without it the form was reachable only by typing a URL — "John can open an order" was not really met. Developer approved expanding scope by this one cell. |
| 2026-05-19 | Phase 3 | **Upload strategy = proxied through the Worker** (not presigned). Size guarded at 15 MB in `photos.ts`. | The Phase 3 risk required deciding before coding. v1 is a few phone photos per section, per-section not batched (PRD §7); one atomic retryable request best fits poor connectivity (Risk 1). Presigned deferred until large-file/high-volume need. |
| 2026-05-19 | Phase 3 | Migration `0004_add_photos.sql` (new file, not an edit) creates `photos`. FK named `inspection_id`, **not** the BUILDPLAN sketch's "order_id"; `section INTEGER CHECK (1–4)`. | Established Phase 1/2 precedent: a committed migration is never edited. `inspection_id` keeps the column name consistent with `form_responses`/`decisions` (an order *is* an inspection row). |
| 2026-05-19 | Phase 3 | Added a 3rd route not in the file list: `GET /api/orders/:id/photos/:photoId` streams the R2 object. | R2 objects are private; the SPA `<img>` needs a Worker-served URL to render them — "photos appear in the section" is unmet without it. Same precedent as the Phase 2 Dashboard `<Link>` (necessary, in-scope consequence). |
| 2026-05-19 | Phase 3 | `wrangler.toml` R2 binding uncommented + `PHOTOS: R2Bucket` added to `Env`. `api.ts` extended with `listPhotos`/`uploadPhoto`; `InspectionForm.test.tsx` mock patched to answer the new on-mount `/photos` GET. | Required to wire R2 (tests use miniflare's simulated bucket). `api.ts` follows the existing thin-wrapper precedent; the mock patch keeps Phase 2 specs green now that the form fetches photos. |
| 2026-05-19 | Phase 3 / infra | Deploy prerequisite resolved: developer enabled R2 on the account (dashboard); created bucket `inspection-photos`; applied D1 migrations `--remote` (0001–0004). Corrected the long-standing "token has no `r2` scope" note — Wrangler 4.92 exposes **no** `r2` OAuth scope; R2 is gated at the account level, and the remote D1 had never been migrated (Phase 0 was local-only). | Unblocks remote deploy of photo storage. Institutional note for Phase 4+: remote D1 is now in sync with local/migrations; the first remote migration also created `inspections`/`form_responses`/`decisions` for the first time. |
| 2026-05-19 | Phase 4 | Migration `0005_finalize_decisions.sql` (new file, not an edit) DROPs the placeholder `decision TEXT NOT NULL` column from 0001 and ADDs `premium_direction` + `policy_action` with CHECK lists mirroring PRD §4 story 3 verbatim (`increase`/`decrease`/`no change`; `approve`/`cancel`/`renew`). Adds `UNIQUE INDEX idx_decisions_inspection_unique` so v1 records one decision per inspection. | The 0001 sketch's `decision TEXT NOT NULL` was never written to and didn't match what Story 3 actually captures. Drop is safe: no Phase up to here inserted a decisions row, and the remote D1 was just freshly seeded (Phase-3 institutional note). UNIQUE-on-`inspection_id` makes POST .../decision an idempotent upsert — same pattern as form_responses, same Risk-1 motivation. |
| 2026-05-19 | Phase 4 | `decisions.ts` POST guards on `status IN ('Submitted', 'Reviewed')` — an Ordered/In Progress inspection returns 409. | Kelly can only decide on something John has actually submitted; the BUILDPLAN file list didn't call this out, but without the guard a stray POST would mark a half-done form as Reviewed and freeze its decided_at, polluting cycle time. |
| 2026-05-19 | Phase 4 | `cycle_time_days` computed server-side in `orders.ts` SQL (`CAST(MAX(0, ROUND(julianday(decided_at) - julianday(created_at))) AS INTEGER)`); Dashboard switched from client-side date math to reading the field. `Order` type and Dashboard test fixture updated. | The BUILDPLAN names server-side computation explicitly. Doing it in SQL means every client sees the same number regardless of timezone, the dashboard stays a thin view, and the test asserts the contract directly instead of duplicating the math in the component. |
| 2026-05-19 | Phase 4 | Extracted `src/client/form-spec.ts` (SECTIONS / FieldDef / ENUM_OPTIONS / normalizeLoaded / formatValue) — not in the phase's file list — and refactored InspectionForm.tsx to import from it. ReviewDetail.tsx reads the same spec. | The Phase 4 risk note said "reuse FormSection components in read-only mode to avoid duplicating the form structure". FormSection is editor-specific (save-state footer); the actually-shared piece is the field spec. Extracting the data, not the wrapper, prevents the editable and read-only views from drifting on any future field add/rename. |
| 2026-05-19 | Phase 4 | `api.ts` extended (not in file list) with `loadDecision`/`recordDecision` + `Decision`/`DecisionInput`/`PremiumDirection`/`PolicyAction` types. | Same thin-wrapper precedent as Phase 2 (`loadForm`/`saveFormSection`) and Phase 3 (`listPhotos`/`uploadPhoto`) — pages stay about UI. |
| 2026-05-19 | Phase 4 | `main.tsx` adds `/review/:id` route (not in file list). Nav still points at `/review` (the queue); the detail route is reached by clicking a row. | Mirrors the Phase-2 precedent of `/orders/:id` linked from the Dashboard. Needed so "Kelly can record a decision" is reachable without typing a URL. |

---

## Handoff notes

_What state should the repo be in when this plan is "done"?_

- Public URL deployed and linked from README.
- All Must-have user stories from PRD.md §4 (stories 1–5) have green tests.
- Story 6 (photos) has green tests.
- Architecture diagram regenerated and committed.
- Demo video and PRD video linked from README.
