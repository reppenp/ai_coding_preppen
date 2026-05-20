import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../index";

// Phase 4 — Story 3 (Kelly records a decision) + Story 4 (cycle time visible).
// A decision is per submitted inspection: notes, premium_direction, policy_action.
// Recording it flips inspections.status to 'Reviewed' and sets decided_at.

async function call(req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function newOrder(): Promise<string> {
  const res = await call(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        insured_name: "Maria's Tacos LLC",
        property_address: "123 Market St, Springfield",
        property_use: "Restaurant",
      }),
    }),
  );
  return ((await res.json()) as { id: string }).id;
}

// The 8 required-to-submit fields, plus an extra optional one so the report
// has something for Kelly to read.
const COMPLETE_REQUIRED = {
  roof_condition: "Good",
  foundation_condition: "Fair",
  electrical_condition: "Good",
  fire_exits_adequate: true,
  hazardous_materials_present: false,
  fire_suppression_present: true,
  occupancy_type: "Leased",
  high_risk_processes_present: false,
};

/** Walk an order all the way to "Submitted" so it's eligible for a decision. */
async function submittedOrder(): Promise<string> {
  const id = await newOrder();
  await call(
    new Request(`http://localhost/api/orders/${id}/form`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(COMPLETE_REQUIRED),
    }),
  );
  await call(
    new Request(`http://localhost/api/orders/${id}/submit`, { method: "POST" }),
  );
  return id;
}

function postDecision(id: string, body: unknown) {
  return call(
    new Request(`http://localhost/api/orders/${id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function getDecision(id: string) {
  return call(new Request(`http://localhost/api/orders/${id}/decision`));
}

const VALID_DECISION = {
  premium_direction: "increase",
  policy_action: "renew",
  notes: "Roof at end of life; replace within 12 months.",
};

describe("POST /api/orders/:id/decision", () => {
  it("404s for an unknown order", async () => {
    const res = await postDecision("does-not-exist", VALID_DECISION);
    expect(res.status).toBe(404);
  });

  it("400s when premium_direction is missing", async () => {
    const id = await submittedOrder();
    const res = await postDecision(id, { policy_action: "approve" });
    expect(res.status).toBe(400);
  });

  it("400s when policy_action is missing", async () => {
    const id = await submittedOrder();
    const res = await postDecision(id, { premium_direction: "decrease" });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid premium_direction value", async () => {
    const id = await submittedOrder();
    const res = await postDecision(id, {
      premium_direction: "raise it a bunch",
      policy_action: "approve",
    });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid policy_action value", async () => {
    const id = await submittedOrder();
    const res = await postDecision(id, {
      premium_direction: "decrease",
      policy_action: "delete",
    });
    expect(res.status).toBe(400);
  });

  it("409s when the order has not been submitted yet", async () => {
    // An Ordered/In Progress inspection is not Kelly's to decide on yet.
    const id = await newOrder();
    const res = await postDecision(id, VALID_DECISION);
    expect(res.status).toBe(409);
  });

  it("records the decision, flips status to 'Reviewed', sets decided_at", async () => {
    const id = await submittedOrder();
    const res = await postDecision(id, VALID_DECISION);
    expect(res.status).toBe(201);

    const body = (await res.json()) as {
      ok: boolean;
      status: string;
      decision: {
        premium_direction: string;
        policy_action: string;
        notes: string | null;
        created_at: string;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("Reviewed");
    expect(body.decision.premium_direction).toBe("increase");
    expect(body.decision.policy_action).toBe("renew");
    expect(body.decision.notes).toBe(VALID_DECISION.notes);

    const row = await env.DB.prepare(
      "SELECT status, decided_at FROM inspections WHERE id = ?",
    )
      .bind(id)
      .first<{ status: string; decided_at: string }>();
    expect(row?.status).toBe("Reviewed");
    expect(typeof row?.decided_at).toBe("string");
    expect(row?.decided_at.length).toBeGreaterThan(0);
  });

  it("allows notes to be omitted", async () => {
    const id = await submittedOrder();
    const res = await postDecision(id, {
      premium_direction: "no change",
      policy_action: "approve",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { decision: { notes: string | null } };
    expect(body.decision.notes).toBeNull();
  });

  it("upserts on retry instead of failing the UNIQUE constraint", async () => {
    const id = await submittedOrder();
    expect((await postDecision(id, VALID_DECISION)).status).toBe(201);

    const second = await postDecision(id, {
      premium_direction: "decrease",
      policy_action: "cancel",
      notes: "Reconsidered after a phone call.",
    });
    expect(second.status).toBe(201);

    const body = (await second.json()) as {
      decision: { premium_direction: string; policy_action: string };
    };
    expect(body.decision.premium_direction).toBe("decrease");
    expect(body.decision.policy_action).toBe("cancel");

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM decisions WHERE inspection_id = ?",
    )
      .bind(id)
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });
});

describe("GET /api/orders/:id/decision", () => {
  it("404s for an unknown order", async () => {
    const res = await getDecision("does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns null when no decision has been recorded yet", async () => {
    const id = await submittedOrder();
    const res = await getDecision(id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { decision: unknown };
    expect(body.decision).toBeNull();
  });

  it("returns the recorded decision after POST", async () => {
    const id = await submittedOrder();
    await postDecision(id, VALID_DECISION);

    const res = await getDecision(id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      decision: {
        premium_direction: string;
        policy_action: string;
        notes: string | null;
      };
    };
    expect(body.decision.premium_direction).toBe("increase");
    expect(body.decision.policy_action).toBe("renew");
    expect(body.decision.notes).toBe(VALID_DECISION.notes);
  });
});
