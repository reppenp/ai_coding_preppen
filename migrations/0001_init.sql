-- Migration 0001 — initial schema.
-- Mirrors src/db/schema.sql. Applied with `wrangler d1 migrations apply`.
-- Safe to edit in place: this migration has never been committed or applied
-- to a remote/shared D1 (local only). Once shared, add a new migration instead.

CREATE TABLE IF NOT EXISTS inspections (
  id                 TEXT PRIMARY KEY,
  status             TEXT NOT NULL DEFAULT 'Ordered'
                       CHECK (status IN ('Ordered', 'In Progress', 'Submitted', 'Reviewed')),
  source             TEXT CHECK (source IN ('Policy', 'Claims')),
  insured_name       TEXT NOT NULL,
  property_address   TEXT NOT NULL,
  contact_name       TEXT,
  contact_phone      TEXT,
  assigned_inspector TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at       TEXT,
  decided_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections (status);

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

  -- Section 2 — Safety & Risk Management
  fire_exits_adequate         INTEGER CHECK (fire_exits_adequate IN (0, 1)),
  fire_exits_notes            TEXT,
  security_systems            TEXT,
  hazardous_materials_storage TEXT,
  slip_trip_fall_measures     TEXT,
  fire_suppression_systems    TEXT,

  -- Section 3 — Occupancy & Usage
  tenant_types       TEXT,
  occupancy_type     TEXT CHECK (occupancy_type IN ('Owner-occupied', 'Leased', 'Multi-tenant')),
  foot_traffic_volume TEXT,
  high_risk_processes TEXT,

  -- Section 4 — Liability Exposures
  parking_sidewalk_condition TEXT,
  ada_compliant              INTEGER CHECK (ada_compliant IN (0, 1)),
  ada_notes                  TEXT,
  public_safety_protocols    TEXT,
  safety_training_programs   TEXT,

  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS decisions (
  id            TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections (id) ON DELETE CASCADE,
  decision      TEXT NOT NULL,
  notes         TEXT,
  decided_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_decisions_inspection ON decisions (inspection_id);
