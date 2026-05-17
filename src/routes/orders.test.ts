import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../index";

// Helper: drive the real Worker the way Cloudflare does in production.
async function call(req: Request) {
  const ctx = createExecutionContext();
  const res = await app.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

function postOrder(body: unknown) {
  return call(
    new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const validOrder = {
  insured_name: "Maria's Tacos LLC",
  property_address: "123 Market St, Springfield",
  property_use: "Restaurant",
  source: "Policy",
  contact_name: "Maria Lopez",
  contact_phone: "555-0142",
};

describe("POST /api/orders", () => {
  it("creates an order and returns 201 with the new id", async () => {
    const res = await postOrder(validOrder);
    expect(res.status).toBe(201);

    const json = (await res.json()) as { id: string };
    expect(typeof json.id).toBe("string");
    expect(json.id.length).toBeGreaterThan(0);
  });

  it("persists the order with default status 'Ordered'", async () => {
    const created = (await (await postOrder(validOrder)).json()) as {
      id: string;
    };

    const row = await env.DB.prepare(
      "SELECT status, insured_name, property_use FROM inspections WHERE id = ?",
    )
      .bind(created.id)
      .first<{
        status: string;
        insured_name: string;
        property_use: string;
      }>();

    expect(row?.status).toBe("Ordered");
    expect(row?.insured_name).toBe(validOrder.insured_name);
    expect(row?.property_use).toBe(validOrder.property_use);
  });

  it("rejects a request missing required fields with 400", async () => {
    const res = await postOrder({ contact_name: "No Name" });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid source value with 400", async () => {
    const res = await postOrder({ ...validOrder, source: "Twitter" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/orders", () => {
  it("returns the list with status and created_at for each order", async () => {
    const created = (await (await postOrder(validOrder)).json()) as {
      id: string;
    };

    const res = await call(new Request("http://localhost/api/orders"));
    expect(res.status).toBe(200);

    const orders = (await res.json()) as Array<{
      id: string;
      status: string;
      insured_name: string;
      created_at: string;
    }>;

    expect(Array.isArray(orders)).toBe(true);
    const found = orders.find((o) => o.id === created.id);
    expect(found).toBeDefined();
    expect(found?.status).toBe("Ordered");
    expect(typeof found?.created_at).toBe("string");
    expect(found?.created_at.length).toBeGreaterThan(0);
  });
});
