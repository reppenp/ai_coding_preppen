import { Hono } from "hono";
import type { Env } from "../index";

// Inspection-form API. Mounted at /api/orders by src/index.ts, so the live
// paths are /api/orders/:id/form (GET load, PUT per-section save) and
// /api/orders/:id/submit (POST final submit).
//
// Story 2 (John completes a field inspection). No auth in v1 (PRD §6).
//
// "Required" is enforced HERE at submit time, not as a D1 constraint: per
// PRD §8 Risk 1 John saves a section at a time in poor connectivity, so every
// form_responses column is nullable and a partial save never fails. PRD §8
// Risk 4 (the field spec) is resolved — see PRD §5; this file is the runtime
// half of that contract.

const forms = new Hono<{ Bindings: Env }>();

// ─── Field spec (mirrors PRD §5 / migration 0003) ──────────────────────────
// Enums are validated here (the condition/volume columns are plain TEXT in
// D1; only occupancy_type + the booleans carry DB CHECKs). Validating here
// means callers get a clean 400 instead of a raw D1 constraint error.

const COND = ["Good", "Fair", "Poor", "N-A"] as const;
const OCCUPANCY = ["Owner-occupied", "Leased", "Multi-tenant"] as const;
const TRAFFIC = ["Low", "Medium", "High"] as const;

type FieldType = "cond" | "occupancy" | "traffic" | "bool" | "int" | "text";

// Order matters: this drives the GET column list and empty-form defaults.
const FIELDS: Record<string, FieldType> = {
  // Section 1 — Building Structure & Maintenance
  roof_condition: "cond",
  roof_age_years: "int",
  roof_materials: "text",
  exterior_walls_condition: "cond",
  foundation_condition: "cond",
  windows_condition: "cond",
  hvac_condition: "cond",
  plumbing_condition: "cond",
  electrical_condition: "cond",
  section1_notes: "text",
  // Section 2 — Safety & Risk Management
  fire_exits_adequate: "bool",
  fire_exits_notes: "text",
  security_systems_present: "bool",
  security_systems: "text",
  hazardous_materials_present: "bool",
  hazardous_materials_storage: "text",
  slip_trip_fall_adequate: "bool",
  slip_trip_fall_notes: "text",
  fire_suppression_present: "bool",
  fire_suppression_systems: "text",
  section2_notes: "text",
  // Section 3 — Occupancy & Usage
  tenant_types: "text",
  occupancy_type: "occupancy",
  foot_traffic_volume: "traffic",
  high_risk_processes_present: "bool",
  high_risk_processes: "text",
  section3_notes: "text",
  // Section 4 — Liability Exposures
  parking_sidewalk_condition: "cond",
  ada_compliant: "bool",
  ada_notes: "text",
  public_safety_protocols: "text",
  safety_training_present: "bool",
  safety_training_programs: "text",
  section4_notes: "text",
};

const FIELD_NAMES = Object.keys(FIELDS);

// The 8 fields John must answer before he can submit (PRD §5). A boolean
// answered "false" (0) is a real answer — "missing" means the column is NULL.
const REQUIRED_TO_SUBMIT = [
  "roof_condition",
  "foundation_condition",
  "electrical_condition",
  "fire_exits_adequate",
  "hazardous_materials_present",
  "fire_suppression_present",
  "occupancy_type",
  "high_risk_processes_present",
] as const;

type Coerced = string | number | null;

/**
 * Validate + coerce one field's value to what D1 stores (text, 0/1, integer)
 * or null to clear it. Returns an error string on a bad value.
 */
function coerce(
  type: FieldType,
  value: unknown,
): { ok: true; value: Coerced } | { ok: false; error: string } {
  if (value === null || value === undefined) return { ok: true, value: null };

  switch (type) {
    case "cond":
    case "occupancy":
    case "traffic": {
      const set =
        type === "cond" ? COND : type === "occupancy" ? OCCUPANCY : TRAFFIC;
      if (typeof value === "string" && (set as readonly string[]).includes(value)) {
        return { ok: true, value };
      }
      return { ok: false, error: `must be one of: ${set.join(", ")}` };
    }
    case "bool": {
      if (value === true || value === 1) return { ok: true, value: 1 };
      if (value === false || value === 0) return { ok: true, value: 0 };
      return { ok: false, error: "must be a boolean" };
    }
    case "int": {
      const n = typeof value === "string" ? Number(value) : value;
      if (typeof n === "number" && Number.isInteger(n) && n >= 0) {
        return { ok: true, value: n };
      }
      return { ok: false, error: "must be a non-negative integer" };
    }
    case "text": {
      if (typeof value !== "string") return { ok: false, error: "must be text" };
      const trimmed = value.trim();
      return { ok: true, value: trimmed.length > 0 ? trimmed : null };
    }
  }
}

/** The order's header row, or null if the id doesn't exist. */
async function loadOrder(env: Env, id: string) {
  return env.DB.prepare(
    `SELECT id, status, insured_name, property_address, property_use
       FROM inspections WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      status: string;
      insured_name: string;
      property_address: string;
      property_use: string | null;
    }>();
}

// GET /api/orders/:id/form — order meta + saved answers in one round trip
// (the form page needs both; there is no GET /api/orders/:id in v1).
forms.get("/:id/form", async (c) => {
  const id = c.req.param("id");
  const order = await loadOrder(c.env, id);
  if (!order) return c.json({ error: "order not found" }, 404);

  const row = await c.env.DB.prepare(
    `SELECT ${FIELD_NAMES.join(", ")}
       FROM form_responses WHERE inspection_id = ?`,
  )
    .bind(id)
    .first<Record<string, unknown>>();

  // No row yet → every answer column reads back null so the UI renders blank.
  const form: Record<string, unknown> = row ?? {};
  for (const name of FIELD_NAMES) {
    if (form[name] === undefined) form[name] = null;
  }

  return c.json({ order, form });
});

// PUT /api/orders/:id/form — save one section's fields. Idempotent upsert on
// UNIQUE(inspection_id): only the supplied columns are touched, so concurrent
// per-section saves don't clobber each other and a retry is safe.
forms.put("/:id/form", async (c) => {
  const id = c.req.param("id");
  const order = await loadOrder(c.env, id);
  if (!order) return c.json({ error: "order not found" }, 404);

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return c.json({ error: "body must be an object of fields" }, 400);
  }

  const cols: string[] = [];
  const values: Coerced[] = [];
  for (const [key, raw] of Object.entries(body)) {
    const type = FIELDS[key];
    if (!type) return c.json({ error: `unknown field: ${key}` }, 400);
    const result = coerce(type, raw);
    if (!result.ok) {
      return c.json({ error: `${key}: ${result.error}` }, 400);
    }
    cols.push(key);
    values.push(result.value);
  }
  if (cols.length === 0) {
    return c.json({ error: "no recognized fields to save" }, 400);
  }

  // INSERT … ON CONFLICT(inspection_id) DO UPDATE — the pattern schema.sql was
  // designed around. `excluded.<col>` is the value this statement would have
  // inserted, so the update touches only the supplied columns.
  const placeholders = cols.map(() => "?").join(", ");
  const updates = cols.map((col) => `${col} = excluded.${col}`).join(", ");
  await c.env.DB.prepare(
    `INSERT INTO form_responses (id, inspection_id, ${cols.join(", ")}, updated_at)
       VALUES (?, ?, ${placeholders}, datetime('now'))
     ON CONFLICT(inspection_id) DO UPDATE SET
       ${updates}, updated_at = datetime('now')`,
  )
    .bind(crypto.randomUUID(), id, ...values)
    .run();

  // First save means John has started: Ordered → In Progress. Never regress
  // a Submitted/Reviewed order.
  await c.env.DB.prepare(
    `UPDATE inspections SET status = 'In Progress', updated_at = datetime('now')
       WHERE id = ? AND status = 'Ordered'`,
  )
    .bind(id)
    .run();

  const saved = await c.env.DB.prepare(
    `SELECT updated_at FROM form_responses WHERE inspection_id = ?`,
  )
    .bind(id)
    .first<{ updated_at: string }>();

  return c.json({ ok: true, updated_at: saved?.updated_at });
});

// POST /api/orders/:id/submit — final submit. Enforces the 8-field
// required-to-submit gate (PRD §5); a NULL column is "unanswered" (a false/0
// boolean is a valid answer and passes).
forms.post("/:id/submit", async (c) => {
  const id = c.req.param("id");
  const order = await loadOrder(c.env, id);
  if (!order) return c.json({ error: "order not found" }, 404);

  const row = await c.env.DB.prepare(
    `SELECT ${REQUIRED_TO_SUBMIT.join(", ")}
       FROM form_responses WHERE inspection_id = ?`,
  )
    .bind(id)
    .first<Record<string, unknown>>();

  const missing = REQUIRED_TO_SUBMIT.filter(
    (col) => !row || row[col] === null || row[col] === undefined,
  );
  if (missing.length > 0) {
    return c.json(
      { error: "inspection is incomplete", missing },
      400,
    );
  }

  await c.env.DB.prepare(
    `UPDATE inspections
        SET status = 'Submitted',
            submitted_at = datetime('now'),
            updated_at = datetime('now')
      WHERE id = ? AND status != 'Reviewed'`,
  )
    .bind(id)
    .run();

  return c.json({ ok: true, status: "Submitted" });
});

export default forms;
