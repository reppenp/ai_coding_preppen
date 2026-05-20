import { Hono } from "hono";
import type { Env } from "../index";

// Underwriting-decision API. Mounted at /api/orders by src/index.ts, so the
// live paths are:
//   POST /api/orders/:id/decision   — record (or replace) Kelly's decision
//   GET  /api/orders/:id/decision   — load the existing decision (or null)
//
// Story 3 (PRD §4): Kelly reviews a submitted inspection and records notes,
// a premium adjustment direction, and a policy action. Story 4 (cycle time):
// recording the decision is also the timestamp the dashboard reads — POST
// sets inspections.decided_at to "now" alongside flipping status to 'Reviewed'.
//
// No auth in v1 (PRD §6) — the API trusts that the caller is Kelly. v2 should
// gate this on a role.

const decisions = new Hono<{ Bindings: Env }>();

// CHECK lists mirror migration 0005 verbatim. Strings copied straight from
// PRD §4 story 3 — keep them in sync if either side moves.
const PREMIUM_DIRECTIONS = ["increase", "decrease", "no change"] as const;
const POLICY_ACTIONS = ["approve", "cancel", "renew"] as const;

type PremiumDirection = (typeof PREMIUM_DIRECTIONS)[number];
type PolicyAction = (typeof POLICY_ACTIONS)[number];

interface DecisionInput {
  premium_direction: PremiumDirection;
  policy_action: PolicyAction;
  notes: string | null;
}

interface DecisionRow {
  id: string;
  inspection_id: string;
  notes: string | null;
  premium_direction: PremiumDirection;
  policy_action: PolicyAction;
  decided_by: string | null;
  created_at: string;
}

/** Trim to a non-empty string or null — same helper shape as orders.ts. */
function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validate(
  body: Record<string, unknown>,
): { ok: true; value: DecisionInput } | { ok: false; error: string } {
  const pd = body.premium_direction;
  if (typeof pd !== "string" || !(PREMIUM_DIRECTIONS as readonly string[]).includes(pd)) {
    return {
      ok: false,
      error: `premium_direction must be one of: ${PREMIUM_DIRECTIONS.join(", ")}`,
    };
  }
  const pa = body.policy_action;
  if (typeof pa !== "string" || !(POLICY_ACTIONS as readonly string[]).includes(pa)) {
    return {
      ok: false,
      error: `policy_action must be one of: ${POLICY_ACTIONS.join(", ")}`,
    };
  }
  return {
    ok: true,
    value: {
      premium_direction: pd as PremiumDirection,
      policy_action: pa as PolicyAction,
      notes: str(body.notes),
    },
  };
}

/** The order row, or null if the id doesn't exist. */
function loadOrder(env: Env, id: string) {
  return env.DB.prepare(`SELECT id, status FROM inspections WHERE id = ?`)
    .bind(id)
    .first<{ id: string; status: string }>();
}

function loadDecision(env: Env, id: string) {
  return env.DB.prepare(
    `SELECT id, inspection_id, notes, premium_direction, policy_action,
            decided_by, created_at
       FROM decisions WHERE inspection_id = ?`,
  )
    .bind(id)
    .first<DecisionRow>();
}

// POST /api/orders/:id/decision — record Kelly's underwriting decision.
// Upserts on UNIQUE(inspection_id), so a retry after a connectivity blip is
// idempotent (PRD §8 Risk 1, same pattern as form_responses). Only callable
// on inspections that have been Submitted — an Ordered/In Progress report is
// not Kelly's to decide on yet.
decisions.post("/:id/decision", async (c) => {
  const id = c.req.param("id");
  const order = await loadOrder(c.env, id);
  if (!order) return c.json({ error: "order not found" }, 404);
  if (order.status !== "Submitted" && order.status !== "Reviewed") {
    return c.json(
      { error: "order is not ready for review — submit the inspection first" },
      409,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const result = validate(body);
  if (!result.ok) return c.json({ error: result.error }, 400);

  const v = result.value;
  // INSERT … ON CONFLICT(inspection_id) DO UPDATE — same pattern as
  // form_responses. `excluded.<col>` is the value this statement would have
  // inserted, so a retry overwrites cleanly without violating the UNIQUE index.
  await c.env.DB.prepare(
    `INSERT INTO decisions
       (id, inspection_id, notes, premium_direction, policy_action)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(inspection_id) DO UPDATE SET
       notes = excluded.notes,
       premium_direction = excluded.premium_direction,
       policy_action = excluded.policy_action`,
  )
    .bind(crypto.randomUUID(), id, v.notes, v.premium_direction, v.policy_action)
    .run();

  // Flip status → Reviewed and stamp decided_at. Cycle time (Story 4) reads
  // decided_at - created_at from inspections, so these two writes happen
  // atomically per decision: the only "decided at" the dashboard ever sees.
  await c.env.DB.prepare(
    `UPDATE inspections
        SET status = 'Reviewed',
            decided_at = datetime('now'),
            updated_at = datetime('now')
      WHERE id = ?`,
  )
    .bind(id)
    .run();

  const saved = await loadDecision(c.env, id);
  return c.json({ ok: true, status: "Reviewed", decision: saved }, 201);
});

// GET /api/orders/:id/decision — load the existing decision, or null if none.
// Used by the review detail page to populate the form when Kelly revisits an
// already-decided inspection.
decisions.get("/:id/decision", async (c) => {
  const id = c.req.param("id");
  const order = await loadOrder(c.env, id);
  if (!order) return c.json({ error: "order not found" }, 404);

  const decision = await loadDecision(c.env, id);
  return c.json({ decision: decision ?? null });
});

export default decisions;
