// Thin typed wrapper over the /api/orders endpoints. Keeps fetch + JSON
// plumbing out of the components so pages stay about UI, not transport.

export type OrderStatus =
  | "Ordered"
  | "In Progress"
  | "Submitted"
  | "Reviewed";

export interface Order {
  id: string;
  status: OrderStatus;
  source: "Policy" | "Claims" | null;
  insured_name: string;
  property_address: string;
  property_use: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  assigned_inspector: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  decided_at: string | null;
}

export interface NewOrderInput {
  insured_name: string;
  property_address: string;
  property_use: string;
  source?: "Policy" | "Claims";
  contact_name?: string;
  contact_phone?: string;
  assigned_inspector?: string;
}

export async function listOrders(): Promise<Order[]> {
  const res = await fetch("/api/orders");
  if (!res.ok) throw new Error(`Failed to load orders (${res.status})`);
  return (await res.json()) as Order[];
}

export async function createOrder(
  input: NewOrderInput,
): Promise<{ id: string }> {
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to create order (${res.status})`);
  }
  return (await res.json()) as { id: string };
}

// ─── Inspection form (Phase 2, Story 2) ────────────────────────────────────
// Wraps GET/PUT /api/orders/:id/form + POST /api/orders/:id/submit. The
// contract mirrors src/routes/forms.ts: every answer column is nullable, GET
// returns booleans as 0/1 integers, and submit enforces the 8-field gate.

/** One answer value as it travels over the wire. null = unanswered. */
export type FormValue = string | number | boolean | null;
export type FormValues = Record<string, FormValue>;

/** Order header the form page needs (there is no GET /api/orders/:id in v1). */
export interface FormOrderMeta {
  id: string;
  status: OrderStatus;
  insured_name: string;
  property_address: string;
  property_use: string | null;
}

export interface FormLoad {
  order: FormOrderMeta;
  form: FormValues;
}

export async function loadForm(id: string): Promise<FormLoad> {
  const res = await fetch(`/api/orders/${id}/form`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to load inspection (${res.status})`);
  }
  return (await res.json()) as FormLoad;
}

/** Save one section's fields. Idempotent upsert server-side — safe to retry
 *  after a connectivity blip (PRD §8 Risk 1). */
export async function saveFormSection(
  id: string,
  values: FormValues,
): Promise<{ ok: true; updated_at: string }> {
  const res = await fetch(`/api/orders/${id}/form`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to save section (${res.status})`);
  }
  return (await res.json()) as { ok: true; updated_at: string };
}

/** Thrown when submit is rejected because required fields are unanswered.
 *  `missing` is the list of field names the API reported (PRD §5 gate). */
export class SubmitIncompleteError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super("Inspection is incomplete.");
    this.name = "SubmitIncompleteError";
    this.missing = missing;
  }
}

export async function submitForm(
  id: string,
): Promise<{ ok: true; status: OrderStatus }> {
  const res = await fetch(`/api/orders/${id}/submit`, { method: "POST" });
  if (res.status === 400) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      missing?: string[];
    };
    if (body.missing) throw new SubmitIncompleteError(body.missing);
    throw new Error(body.error ?? "Failed to submit inspection (400)");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      body.error ?? `Failed to submit inspection (${res.status})`,
    );
  }
  return (await res.json()) as { ok: true; status: OrderStatus };
}
