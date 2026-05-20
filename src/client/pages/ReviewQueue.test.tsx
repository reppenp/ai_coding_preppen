import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReviewQueue } from "./ReviewQueue";
import type { Order } from "../api";

// Phase 4 — Story 3: Kelly's queue. Component test asserts only "Submitted"
// orders make it onto the page (Ordered/In Progress/Reviewed are filtered).

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord-1",
    status: "Submitted",
    source: "Policy",
    insured_name: "Maria's Tacos LLC",
    property_address: "123 Market St",
    property_use: "Restaurant",
    contact_name: null,
    contact_phone: null,
    assigned_inspector: null,
    created_at: "2026-05-16 12:00:00",
    updated_at: "2026-05-16 12:00:00",
    submitted_at: "2026-05-17 09:00:00",
    decided_at: null,
    cycle_time_days: null,
    ...overrides,
  };
}

function mockFetch(orders: Order[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => orders,
    })),
  );
}

function renderQueue() {
  return render(
    <MemoryRouter>
      <ReviewQueue />
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("ReviewQueue", () => {
  it("renders only Submitted orders", async () => {
    mockFetch([
      order({ id: "a", insured_name: "Acme Corp", status: "Submitted" }),
      order({ id: "b", insured_name: "Beta LLC", status: "Ordered" }),
      order({ id: "c", insured_name: "Charlie Inc", status: "Reviewed" }),
      order({ id: "d", insured_name: "Delta Co", status: "In Progress" }),
    ]);

    renderQueue();

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.queryByText("Beta LLC")).not.toBeInTheDocument();
    expect(screen.queryByText("Charlie Inc")).not.toBeInTheDocument();
    expect(screen.queryByText("Delta Co")).not.toBeInTheDocument();
  });

  it("links each insured name to its review detail page", async () => {
    mockFetch([order({ id: "ord-77", insured_name: "Acme Corp" })]);
    renderQueue();

    const link = await screen.findByRole("link", { name: "Acme Corp" });
    expect(link).toHaveAttribute("href", "/review/ord-77");
  });

  it("shows an empty state when nothing is submitted", async () => {
    mockFetch([order({ status: "Ordered" })]);
    renderQueue();
    expect(
      await screen.findByText(/nothing in the queue/i),
    ).toBeInTheDocument();
  });
});
