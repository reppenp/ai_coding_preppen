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
