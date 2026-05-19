import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../index";

// Phase 2 — Story 2: John opens an assigned order, fills the 4-section form,
// saves per section (in poor connectivity), and submits. Status flows
// Ordered → In Progress (first save) → Submitted (submit).

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

function getForm(id: string) {
  return call(new Request(`http://localhost/api/orders/${id}/form`));
}

function putForm(id: string, body: unknown) {
  return call(
    new Request(`http://localhost/api/orders/${id}/form`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function submit(id: string) {
  return call(
    new Request(`http://localhost/api/orders/${id}/submit`, {
      method: "POST",
    }),
  );
}

// All 8 required-to-submit fields (PRD §5). hazardous_materials_present is
// answered "false" on purpose: a false/0 answer is a real answer, not missing.
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

describe("GET /api/orders/:id/form", () => {
  it("404s for an unknown order", async () => {
    const res = await getForm("does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns order meta + an empty form for a fresh order", async () => {
    const id = await newOrder();
    const res = await getForm(id);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      order: { id: string; status: string; insured_name: string };
      form: Record<string, unknown>;
    };
    expect(body.order.id).toBe(id);
    expect(body.order.status).toBe("Ordered");
    expect(body.order.insured_name).toBe("Maria's Tacos LLC");
    // Every answer column is present and null until John fills it in.
    expect(body.form.roof_condition).toBeNull();
    expect(body.form.fire_exits_adequate).toBeNull();
  });
});

describe("PUT /api/orders/:id/form", () => {
  it("404s for an unknown order", async () => {
    const res = await putForm("does-not-exist", { roof_condition: "Good" });
    expect(res.status).toBe(404);
  });

  it("saves a section and reflects it on GET, returning updated_at", async () => {
    const id = await newOrder();
    const put = await putForm(id, {
      roof_condition: "Fair",
      roof_age_years: 12,
      section1_notes: "Minor wear on the north slope.",
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as { ok: boolean; updated_at: string };
    expect(putBody.ok).toBe(true);
    expect(typeof putBody.updated_at).toBe("string");
    expect(putBody.updated_at.length).toBeGreaterThan(0);

    const form = (
      (await (await getForm(id)).json()) as {
        form: Record<string, unknown>;
      }
    ).form;
    expect(form.roof_condition).toBe("Fair");
    expect(form.roof_age_years).toBe(12);
    expect(form.section1_notes).toBe("Minor wear on the north slope.");
  });

  it("coerces booleans to 0/1 and persists them", async () => {
    const id = await newOrder();
    await putForm(id, { fire_exits_adequate: true, ada_compliant: false });
    const form = (
      (await (await getForm(id)).json()) as {
        form: Record<string, unknown>;
      }
    ).form;
    expect(form.fire_exits_adequate).toBe(1);
    expect(form.ada_compliant).toBe(0);
  });

  it("flips status Ordered → In Progress on first save", async () => {
    const id = await newOrder();
    await putForm(id, { roof_condition: "Good" });
    const status = (
      (await (await getForm(id)).json()) as { order: { status: string } }
    ).order.status;
    expect(status).toBe("In Progress");
  });

  it("does separate-section saves without clobbering each other", async () => {
    const id = await newOrder();
    await putForm(id, { roof_condition: "Good" });
    await putForm(id, { occupancy_type: "Leased" });
    const form = (
      (await (await getForm(id)).json()) as {
        form: Record<string, unknown>;
      }
    ).form;
    expect(form.roof_condition).toBe("Good");
    expect(form.occupancy_type).toBe("Leased");
  });

  it("400s on an unknown field name", async () => {
    const id = await newOrder();
    const res = await putForm(id, { not_a_real_column: "x" });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid enum value", async () => {
    const id = await newOrder();
    const res = await putForm(id, { roof_condition: "Great" });
    expect(res.status).toBe(400);
  });

  it("400s when no recognized fields are supplied", async () => {
    const id = await newOrder();
    const res = await putForm(id, {});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/orders/:id/submit", () => {
  it("404s for an unknown order", async () => {
    const res = await submit("does-not-exist");
    expect(res.status).toBe(404);
  });

  it("400s and lists the missing required fields when incomplete", async () => {
    const id = await newOrder();
    await putForm(id, { roof_condition: "Good" });
    const res = await submit(id);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { missing: string[] };
    expect(body.missing).toContain("foundation_condition");
    expect(body.missing).toContain("occupancy_type");
    expect(body.missing).not.toContain("roof_condition");
  });

  it("submits when all 8 required fields are answered (false counts)", async () => {
    const id = await newOrder();
    await putForm(id, COMPLETE_REQUIRED);
    const res = await submit(id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; status: string };
    expect(body.ok).toBe(true);
    expect(body.status).toBe("Submitted");

    const after = (
      (await (await getForm(id)).json()) as { order: { status: string } }
    ).order.status;
    expect(after).toBe("Submitted");
  });
});
