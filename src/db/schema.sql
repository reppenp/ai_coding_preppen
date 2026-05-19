-- Canonical D1 schema for the inspection workflow app.
--
-- This file documents the *current* shape of the database for humans. The
-- actual applied changes live in `migrations/` and are run with
-- `wrangler d1 migrations apply`. In Phase 0 the two are identical; keep them
-- in sync as the schema evolves.
--
-- Status enum is fixed upfront (PRD §9 milestones, BUILDPLAN Phase 1 risk
-- note) to avoid a migration mid-build:
--   Ordered → In Progress → Submitted → Reviewed
--
-- form_responses is the FINALIZED field list (PRD §8 Risk 4 RESOLVED
-- 2026-05-19). The canonical field list, types, and the 8-field
-- required-to-submit set live in PRD §5; this table is kept in sync with
-- migration 0003_finalize_form_responses. Every answer column stays NULLABLE
-- on purpose: "required" is an API/UI submit-gate (POST .../submit), not a DB
-- constraint, so per-section saves in poor connectivity never fail (Risk 1).

-- Inspection orders. Jeff creates these; everyone sees them on the dashboard.
CREATE TABLE IF NOT EXISTS inspections (
  id                 TEXT PRIMARY KEY,
  status             TEXT NOT NULL DEFAULT 'Ordered'
                       CHECK (status IN ('Ordered', 'In Progress', 'Submitted', 'Reviewed')),
  source             TEXT CHECK (source IN ('Policy', 'Claims')),
  insured_name       TEXT NOT NULL,
  property_address   TEXT NOT NULL,
  -- property_use added in migration 0002. Nullable in the DB (PRD §8 Risk 4
  -- still open); the New Order form requires it at the UI layer.
  property_use       TEXT,
  contact_name       TEXT,
  contact_phone      TEXT,
  assigned_inspector TEXT,
  -- Timestamps drive cycle-time reporting (created → decided).
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at       TEXT,
  decided_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections (status);

-- Field inspection answers — ONE row per inspection (1:1). Every answer column
-- is nullable so John can save a section at a time in poor connectivity
-- (PRD §8 Risk 1). The UNIQUE(inspection_id) constraint makes each per-section
-- save an idempotent upsert: INSERT ... ON CONFLICT(inspection_id) DO UPDATE
-- touching only that section's columns, safe under connection retries.
--
-- Columns are the finalized PRD §5 field list; kept in sync with migration
-- 0003_finalize_form_responses. Booleans use INTEGER CHECK (… IN (0, 1));
-- condition/volume enums are plain TEXT (enum enforced at the API/UI layer).
CREATE TABLE IF NOT EXISTS form_responses (
  id            TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL UNIQUE REFERENCES inspections (id) ON DELETE CASCADE,

  -- Section 1 — Building Structure & Maintenance
  roof_condition            TEXT,
  roof_age_years            INTEGER,
  roof_materials            TEXT,
  exterior_walls_condition  TEXT,
  foundation_condition      TEXT,
  windows_condition         TEXT,
  hvac_condition            TEXT,
  plumbing_condition        TEXT,
  electrical_condition      TEXT,
  section1_notes            TEXT,

  -- Section 2 — Safety & Risk Management
  fire_exits_adequate         INTEGER CHECK (fire_exits_adequate IN (0, 1)),
  fire_exits_notes            TEXT,
  security_systems_present    INTEGER CHECK (security_systems_present IN (0, 1)),
  security_systems            TEXT,
  hazardous_materials_present INTEGER CHECK (hazardous_materials_present IN (0, 1)),
  hazardous_materials_storage TEXT,
  slip_trip_fall_adequate     INTEGER CHECK (slip_trip_fall_adequate IN (0, 1)),
  slip_trip_fall_notes        TEXT,
  fire_suppression_present    INTEGER CHECK (fire_suppression_present IN (0, 1)),
  fire_suppression_systems    TEXT,
  section2_notes              TEXT,

  -- Section 3 — Occupancy & Usage
  tenant_types                TEXT,
  occupancy_type              TEXT CHECK (occupancy_type IN ('Owner-occupied', 'Leased', 'Multi-tenant')),
  foot_traffic_volume         TEXT,
  high_risk_processes_present INTEGER CHECK (high_risk_processes_present IN (0, 1)),
  high_risk_processes         TEXT,
  section3_notes              TEXT,

  -- Section 4 — Liability Exposures
  parking_sidewalk_condition TEXT,
  ada_compliant              INTEGER CHECK (ada_compliant IN (0, 1)),
  ada_notes                  TEXT,
  public_safety_protocols    TEXT,
  safety_training_present    INTEGER CHECK (safety_training_present IN (0, 1)),
  safety_training_programs   TEXT,
  section4_notes             TEXT,

  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
-- No separate index on inspection_id: UNIQUE(inspection_id) already indexes it.

-- Underwriter decisions. Kelly records one per inspection after review.
CREATE TABLE IF NOT EXISTS decisions (
  id            TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections (id) ON DELETE CASCADE,
  decision      TEXT NOT NULL,
  notes         TEXT,
  decided_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_decisions_inspection ON decisions (inspection_id);
