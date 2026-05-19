-- Migration 0004 — add the photos table (Phase 3, PRD §4 story 6).
-- John attaches photos to each inspection section so Kelly has visual
-- evidence behind the written findings. 0001–0003 are committed/applied, so
-- per the migration discipline in 0001's header this is a NEW migration.
--
-- Storage split (PRD §7 "Photo handling", BUILDPLAN Phase 3 risk):
--   - The image BYTES live in R2 (binding PHOTOS); D1 only holds metadata +
--     the r2_key pointer. Upload is proxied through the Worker per photo
--     (not presigned, not batched at submit) — one atomic retryable request,
--     which is the right fit for John's poor-connectivity field work (Risk 1).
--
-- Naming: the FK is `inspection_id` (NOT "order_id" as the BUILDPLAN sketch
-- loosely put it) to stay consistent with form_responses / decisions — an
-- "order" and an "inspection" are the same row (inspections.id).
--
-- section is 1..4 (human-meaningful, matches the "Section N of 4" UI labels);
-- the SPA sends active_index + 1. r2_key is UNIQUE: it's the object's address
-- in R2 and a photo maps to exactly one object. No DELETE in v1 (story 6 is
-- attach + show only); ON DELETE CASCADE keeps rows from outliving the order.

CREATE TABLE IF NOT EXISTS photos (
  id            TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections (id) ON DELETE CASCADE,
  section       INTEGER NOT NULL CHECK (section IN (1, 2, 3, 4)),
  r2_key        TEXT NOT NULL UNIQUE,
  filename      TEXT,
  content_type  TEXT,
  size_bytes    INTEGER,
  uploaded_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Photos are read back per inspection (the form loads one order's photos and
-- groups them by section in memory), so index the FK, not (inspection, section).
CREATE INDEX IF NOT EXISTS idx_photos_inspection ON photos (inspection_id);
