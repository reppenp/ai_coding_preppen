-- Migration 0005 — finalize the decisions table (Phase 4, PRD §4 story 3).
-- Kelly records an underwriting decision per submitted inspection: notes, a
-- premium adjustment direction (increase / decrease / no change), and a policy
-- action (approve / cancel / renew). 0001–0004 are committed/applied, so per
-- the migration discipline in 0001's header this is a NEW migration, not an
-- edit to 0001 where `decisions` first appeared.
--
-- What changes vs. 0001:
--   - DROP COLUMN `decision` — a placeholder TEXT NOT NULL field from 0001
--     that nothing ever wrote to. Safe to drop: no Phase up to here inserted a
--     decisions row, and per the 2026-05-19 Phase-3 institutional note the
--     remote D1 was just freshly seeded by 0001–0004 (no rows to preserve).
--     SQLite ≥ 3.35 / D1 supports ALTER TABLE … DROP COLUMN.
--   - ADD `premium_direction` + `policy_action`, both nullable in D1 with a
--     CHECK list mirroring PRD §4 story 3 verbatim. Their *presence* is
--     enforced at the API layer (POST /api/orders/:id/decision), not as a
--     NOT NULL — same pattern as form_responses (every column nullable in D1;
--     "required" is an API submit gate). Notes stay free text and optional.
--   - UNIQUE INDEX on `inspection_id` — v1 records one decision per
--     inspection; no re-review flow. POST upserts on this constraint so a
--     retry after a connectivity blip stays idempotent (PRD §8 Risk 1).
--
-- Cycle time (PRD §4 story 4) is computed from `inspections.decided_at -
-- inspections.created_at`. `inspections.decided_at` is already in 0001 and is
-- set when this decision is recorded — no `decided_at` column duplicated here.

ALTER TABLE decisions DROP COLUMN decision;

ALTER TABLE decisions ADD COLUMN premium_direction TEXT
  CHECK (premium_direction IN ('increase', 'decrease', 'no change'));

ALTER TABLE decisions ADD COLUMN policy_action TEXT
  CHECK (policy_action IN ('approve', 'cancel', 'renew'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_decisions_inspection_unique
  ON decisions (inspection_id);
