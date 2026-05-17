import { Hono } from "hono";
import type { Env } from "../index";

// Inspection-order API. Mounted at /api/orders by src/index.ts.
//
// Story 1 (Jeff creates an order) + Story 5 (everyone sees order status).
// No auth in v1 (PRD §6) — every caller can create and list.

const orders = new Hono<{ Bindings: Env }>();

/** Valid values for the optional `source` column (PRD §2 — Jeff's report origin). */
const SOURCES = ["Policy", "Claims"] as const;
type Source = (typeof SOURCES)[number];

interface CreateOrderInput {
  insured_name: string;
  property_address: string;
  property_use: string | null;
  source: Source | null;
  contact_name: string | null;
  contact_phone: string | null;
  assigned_inspector: string | null;
}

/** Trim a value to a non-empty string, or null if it isn't usable. */
function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validate the request body against what the `inspections` table requires.
 * insured_name + property_address are NOT NULL in the schema, so they are
 * required here. property_use is enforced at the UI layer only (PRD §8 Risk 4
 * is still open) so it stays optional server-side. `source`, if present, must
 * be one of the CHECK-constrained values or D1 would reject the INSERT.
 */
function validate(
  body: Record<string, unknown>,
): { ok: true; value: CreateOrderInput } | { ok: false; error: string } {
  const insured_name = str(body.insured_name);
  const property_address = str(body.property_address);

  if (!insured_name) return { ok: false, error: "insured_name is required" };
  if (!property_address) {
    return { ok: false, error: "property_address is required" };
  }

  let source: Source | null = null;
  if (body.source !== undefined && body.source !== null && body.source !== "") {
    if (!SOURCES.includes(body.source as Source)) {
      return { ok: false, error: "source must be 'Policy' or 'Claims'" };
    }
    source = body.source as Source;
  }

  return {
    ok: true,
    value: {
      insured_name,
      property_address,
      property_use: str(body.property_use),
      source,
      contact_name: str(body.contact_name),
      contact_phone: str(body.contact_phone),
      assigned_inspector: str(body.assigned_inspector),
    },
  };
}

// POST /api/orders — create an order. status + timestamps come from D1
// defaults ('Ordered', datetime('now')).
orders.post("/", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const result = validate(body);
  if (!result.ok) return c.json({ error: result.error }, 400);

  const id = crypto.randomUUID();
  const o = result.value;

  await c.env.DB.prepare(
    `INSERT INTO inspections
       (id, insured_name, property_address, property_use,
        source, contact_name, contact_phone, assigned_inspector)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      o.insured_name,
      o.property_address,
      o.property_use,
      o.source,
      o.contact_name,
      o.contact_phone,
      o.assigned_inspector,
    )
    .run();

  return c.json({ id }, 201);
});

// GET /api/orders — every order, newest first. The Dashboard's data source.
orders.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, status, source, insured_name, property_address, property_use,
            contact_name, contact_phone, assigned_inspector,
            created_at, updated_at, submitted_at, decided_at
       FROM inspections
      ORDER BY created_at DESC`,
  ).all();

  return c.json(results);
});

export default orders;
