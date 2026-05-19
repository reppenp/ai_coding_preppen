-- Migration 0003 — finalize form_responses to the defined field spec.
-- PRD §8 Risk 4 ("define required vs. optional form fields") is RESOLVED
-- (2026-05-19). The canonical field list + the 8-field required-to-submit set
-- now live in PRD §5. 0001/0002 are committed/applied, so per the migration
-- discipline in 0001's header we add a NEW migration rather than editing them.
--
-- Diff vs. the provisional 0001 form_responses table:
--   + 6 presence/adequacy booleans (the structured risk-flag fields from §5)
--   + slip_trip_fall_notes + one free-text notes column per section
--   - slip_trip_fall_measures  (superseded by slip_trip_fall_adequate + _notes)
--
-- All columns stay NULLABLE on purpose. "Required" is enforced at the API/UI
-- submit gate (POST /api/orders/:id/submit), NOT as a DB constraint, so John's
-- per-section saves in poor connectivity never fail (PRD §8 Risk 1). The new
-- booleans use the same INTEGER CHECK (… IN (0, 1)) pattern as the existing
-- fire_exits_adequate / ada_compliant columns. Condition/volume enums remain
-- plain TEXT (enum enforced at API/UI), matching the existing design.

-- Section 2 — Safety & Risk Management
ALTER TABLE form_responses ADD COLUMN security_systems_present   INTEGER CHECK (security_systems_present   IN (0, 1));
ALTER TABLE form_responses ADD COLUMN hazardous_materials_present INTEGER CHECK (hazardous_materials_present IN (0, 1));
ALTER TABLE form_responses ADD COLUMN slip_trip_fall_adequate    INTEGER CHECK (slip_trip_fall_adequate    IN (0, 1));
ALTER TABLE form_responses ADD COLUMN slip_trip_fall_notes       TEXT;
ALTER TABLE form_responses ADD COLUMN fire_suppression_present   INTEGER CHECK (fire_suppression_present   IN (0, 1));

-- Section 3 — Occupancy & Usage
ALTER TABLE form_responses ADD COLUMN high_risk_processes_present INTEGER CHECK (high_risk_processes_present IN (0, 1));

-- Section 4 — Liability Exposures
ALTER TABLE form_responses ADD COLUMN safety_training_present    INTEGER CHECK (safety_training_present    IN (0, 1));

-- One free-text notes column per section
ALTER TABLE form_responses ADD COLUMN section1_notes TEXT;
ALTER TABLE form_responses ADD COLUMN section2_notes TEXT;
ALTER TABLE form_responses ADD COLUMN section3_notes TEXT;
ALTER TABLE form_responses ADD COLUMN section4_notes TEXT;

-- Superseded by slip_trip_fall_adequate (bool) + slip_trip_fall_notes (text).
-- Not referenced by any index/CHECK/FK, so DROP COLUMN is safe (SQLite ≥ 3.35).
ALTER TABLE form_responses DROP COLUMN slip_trip_fall_measures;
