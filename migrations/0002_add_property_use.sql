-- Migration 0002 — add inspections.property_use.
-- PRD §4 story 1 requires property information to include "property use", but
-- 0001's inspections table only captured property_address. 0001 is committed,
-- so per the migration discipline in 0001's header we add a NEW migration
-- rather than editing it in place.
--
-- Nullable on purpose: PRD §8 Risk 4 (required vs. optional field definition)
-- is still OPEN and is a Phase 2 concern. The DB stays permissive; the New
-- Order form (Phase 1) enforces this field as required at the UI layer.

ALTER TABLE inspections ADD COLUMN property_use TEXT;
