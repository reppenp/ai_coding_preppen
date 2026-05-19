import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import type { Order } from "../api";

// Dashboard now renders <Link> cells, so it needs a Router context.
function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord-1",
    status: "Ordered",
    source: "Policy",
    insured_name: "Maria's Tacos LLC",
    property_address: "123 Market St",
    property_use: "Restaurant",
    contact_name: null,
    contact_phone: null,
    assigned_inspector: null,
    created_at: "2026-05-16 12:00:00",
    updated_at: "2026-05-16 12:00:00",
    submitted_at: null,
    decided_at: null,
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

afterEach(() => vi.unstubAllGlobals());

describe("Dashboard", () => {
  it("renders a row per order with its status badge", async () => {
    mockFetch([
      order({ id: "a", insured_name: "Acme Corp", status: "Submitted" }),
      order({ id: "b", insured_name: "Beta LLC", status: "Ordered" }),
    ]);

    renderDashboard();

    expect(await screen.findByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Beta LLC")).toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    // Two cells say "Ordered": the badge text is the assertion target.
    expect(screen.getByText("Ordered")).toBeInTheDocument();
  });

  it("links each insured name to its inspection form", async () => {
    mockFetch([order({ id: "ord-42", insured_name: "Acme Corp" })]);
    renderDashboard();

    const link = await screen.findByRole("link", { name: "Acme Corp" });
    expect(link).toHaveAttribute("href", "/orders/ord-42");
  });

  it("shows an empty state when there are no orders", async () => {
    mockFetch([]);
    renderDashboard();
    expect(
      await screen.findByText(/no inspection orders yet/i),
    ).toBeInTheDocument();
  });
});
