# ERD — D1 schema

> **Last regenerated:** 2026-05-26
> **Generated from:** `migrations/0001_init.sql` → `migrations/0005_finalize_decisions.sql` (full migration history applied).
> Regenerate at the end of every week — if it no longer matches the migrations, something drifted.

```mermaid
erDiagram
    INSPECTIONS ||--o| FORM_RESPONSES : "0..1"
    INSPECTIONS ||--o| DECISIONS      : "0..1"
    INSPECTIONS ||--o{ PHOTOS         : "0..N"

    INSPECTIONS {
        TEXT id PK
        TEXT status "NOT NULL · CHECK: Ordered / In Progress / Submitted / Reviewed · DEFAULT Ordered"
        TEXT source "CHECK: Policy / Claims (nullable)"
        TEXT insured_name "NOT NULL"
        TEXT property_address "NOT NULL"
        TEXT property_use "added in 0002 · UI-required, DB-nullable"
        TEXT contact_name
        TEXT contact_phone
        TEXT assigned_inspector
        TEXT created_at "NOT NULL · DEFAULT datetime now"
        TEXT updated_at "NOT NULL · DEFAULT datetime now"
        TEXT submitted_at "set on POST /:id/submit"
        TEXT decided_at "set on POST /:id/decision · drives cycle_time_days"
    }

    FORM_RESPONSES {
        TEXT id PK
        TEXT inspection_id FK "NOT NULL · UNIQUE → inspections.id ON DELETE CASCADE"
        TEXT roof_condition "enum Good/Fair/Poor/N-A · REQ at submit"
        INTEGER roof_age_years
        TEXT roof_materials
        TEXT exterior_walls_condition "enum Good/Fair/Poor/N-A"
        TEXT foundation_condition "enum Good/Fair/Poor/N-A · REQ at submit"
        TEXT windows_condition "enum Good/Fair/Poor/N-A"
        TEXT hvac_condition "enum Good/Fair/Poor/N-A"
        TEXT plumbing_condition "enum Good/Fair/Poor/N-A"
        TEXT electrical_condition "enum Good/Fair/Poor/N-A · REQ at submit"
        TEXT section1_notes "added in 0003"
        INTEGER fire_exits_adequate "bool · CHECK 0/1 · REQ at submit"
        TEXT fire_exits_notes
        INTEGER security_systems_present "bool · CHECK 0/1 · added in 0003"
        TEXT security_systems "describe cameras / lighting / alarms"
        INTEGER hazardous_materials_present "bool · CHECK 0/1 · added in 0003 · REQ at submit"
        TEXT hazardous_materials_storage
        INTEGER slip_trip_fall_adequate "bool · CHECK 0/1 · added in 0003"
        TEXT slip_trip_fall_notes "added in 0003 · replaced slip_trip_fall_measures"
        INTEGER fire_suppression_present "bool · CHECK 0/1 · added in 0003 · REQ at submit"
        TEXT fire_suppression_systems
        TEXT section2_notes "added in 0003"
        TEXT tenant_types
        TEXT occupancy_type "enum Owner-occupied/Leased/Multi-tenant · REQ at submit"
        TEXT foot_traffic_volume "enum Low/Medium/High"
        INTEGER high_risk_processes_present "bool · CHECK 0/1 · added in 0003 · REQ at submit"
        TEXT high_risk_processes "describe welding / cooking / manufacturing"
        TEXT section3_notes "added in 0003"
        TEXT parking_sidewalk_condition "enum Good/Fair/Poor/N-A"
        INTEGER ada_compliant "bool · CHECK 0/1"
        TEXT ada_notes
        TEXT public_safety_protocols
        INTEGER safety_training_present "bool · CHECK 0/1 · added in 0003"
        TEXT safety_training_programs
        TEXT section4_notes "added in 0003"
        TEXT updated_at "NOT NULL · DEFAULT datetime now · all answer columns NULLABLE"
    }

    PHOTOS {
        TEXT id PK
        TEXT inspection_id FK "NOT NULL → inspections.id ON DELETE CASCADE · idx_photos_inspection"
        INTEGER section "NOT NULL · CHECK 1/2/3/4"
        TEXT r2_key "NOT NULL · UNIQUE · pointer to R2 object"
        TEXT filename
        TEXT content_type
        INTEGER size_bytes
        TEXT uploaded_at "NOT NULL · DEFAULT datetime now"
    }

    DECISIONS {
        TEXT id PK
        TEXT inspection_id FK "NOT NULL · UNIQUE idx_decisions_inspection_unique → inspections.id ON DELETE CASCADE"
        TEXT premium_direction "CHECK: increase / decrease / no change · added in 0005 · API-required"
        TEXT policy_action "CHECK: approve / cancel / renew · added in 0005 · API-required"
        TEXT notes
        TEXT decided_by "nullable — no auth in v1"
        TEXT created_at "NOT NULL · DEFAULT datetime now"
    }
```

## How it works

`inspections` is the spine. Every other table joins to it by `inspection_id` and cascades on delete, so removing an inspection wipes its form, photos, and decision in one statement. `form_responses` and `decisions` are each one-row-per-inspection — enforced by `UNIQUE(inspection_id)` (an inline constraint on `form_responses`, an index named `idx_decisions_inspection_unique` on `decisions`) — which is what makes the `INSERT … ON CONFLICT(inspection_id) DO UPDATE` pattern legal in both routes and safe to retry on flaky connectivity. `photos` is one-to-many partitioned by `section (1..4)`; image bytes live in R2 (`photos.r2_key` is the pointer), not in D1.

## Field-spec notes

- **Every answer column in `form_responses` is NULLABLE on purpose.** John saves a section at a time in poor connectivity (PRD §8 Risk 1); a partial save must never fail a CHECK or NOT NULL.
- **"Required" is an API/UI submit gate, not a DB constraint.** The eight columns annotated `REQ at submit` are checked in `POST /api/orders/:id/submit` (see `REQUIRED_TO_SUBMIT` in `src/routes/forms.ts`). A `false` (0) boolean counts as a real answer; only `NULL` is "missing".
- **Booleans are `INTEGER CHECK (col IN (0, 1))`** — SQLite has no native bool. The route layer coerces JS booleans on write.
- **Condition / occupancy / traffic enums are plain TEXT.** Only `occupancy_type` carries an enum CHECK in D1; the others are enforced in `src/routes/forms.ts` so a bad value returns a clean 400 instead of a raw D1 constraint error.

## Decisions that shaped this design

1. **Image bytes in R2, only the pointer in D1.** `photos` stores `r2_key` (unique) plus metadata; the bytes live in the `inspection-photos` R2 bucket. Splitting this way keeps D1 small and lets the SPA stream images via a Worker route (`GET /:id/photos/:photoId`) without exposing the bucket — necessary because R2 objects are private. The proxied-upload-vs-presigned decision is in `docs/architecture.md`.

2. **`UNIQUE(inspection_id)` on `form_responses` and `decisions`, not a separate row per save.** Both writes are upserts on that constraint. This makes retries idempotent after a connectivity blip (PRD §8 Risk 1) without per-route deduping logic, and matches the v1 product rule of one form / one decision per inspection.

3. **Migrations are append-only; committed files are never edited in place.** The header in `0001_init.sql` sets the rule, and 0002–0005 follow it (e.g. 0003 adds Section-2 booleans + per-section notes rather than rewriting 0001; 0005 drops the placeholder `decision` column from 0001 rather than amending the original CREATE). Lets the local + remote D1 stay in lockstep with one `wrangler d1 migrations apply` command per environment.

## Things deliberately NOT on this diagram

- **R2 objects.** Shown in `docs/architecture.md` as the storage half of `photos`.
- **Soft deletes / archive flags.** No row in v1 is ever logically deleted; ON DELETE CASCADE handles hard deletes if they ever happen.
- **Audit trail / change history.** No `who-changed-what-when` table. `updated_at` is the only mutation timestamp; v2 will need this once auth lands.
- **Versioning of form responses.** One form per inspection, overwritten on each save. No history of prior submissions.
- **Indexes other than the ones enforcing FK/UNIQUE constraints.** `idx_inspections_status`, `idx_photos_inspection`, and `idx_decisions_inspection_unique` are the only ones today.

If any of those land, redraw this in the same session.
