import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { InspectionForm } from "./InspectionForm";

// Phase 2 component tests (BUILDPLAN): the form renders all four sections with
// the correct fields, and a partially-saved form reloads its saved state on
// refresh. Plus the two flows that make the page useful: per-section save
// hits PUT, and an incomplete submit surfaces the missing required fields.

interface Handlers {
  form?: Record<string, unknown>;
  submitMissing?: string[] | null; // null/undefined → submit succeeds
}

function mockApi({ form = {}, submitMissing }: Handlers = {}) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });

    if (method === "GET" && url.endsWith("/form")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          order: {
            id: "ord-1",
            status: "Ordered",
            insured_name: "Maria's Tacos LLC",
            property_address: "123 Market St",
            property_use: "Restaurant",
          },
          form,
        }),
      };
    }
    if (method === "PUT" && url.endsWith("/form")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, updated_at: "2026-05-19 10:30:00" }),
      };
    }
    if (method === "POST" && url.endsWith("/submit")) {
      if (submitMissing && submitMissing.length > 0) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: "inspection is incomplete",
            missing: submitMissing,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, status: "Submitted" }),
      };
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderForm() {
  return render(
    <MemoryRouter initialEntries={["/orders/ord-1"]}>
      <Routes>
        <Route path="/orders/:id" element={<InspectionForm />} />
        <Route path="/" element={<div>DASHBOARD HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("InspectionForm", () => {
  it("renders all four sections with the correct fields", async () => {
    mockApi();
    renderForm();

    // Progress rail lists every section.
    expect(
      await screen.findByRole("button", {
        name: /Building Structure & Maintenance/i,
      }),
    ).toBeInTheDocument();
    for (const title of [
      "Safety & Risk Management",
      "Occupancy & Usage",
      "Liability Exposures",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(title, "i") }),
      ).toBeInTheDocument();
    }

    // Section 1 is active and shows its fields; a required field is marked.
    const roof = screen.getByLabelText(/roof condition/i);
    expect(roof).toBeInTheDocument();
    expect(roof).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/roof age \(years\)/i)).toBeInTheDocument();

    // Jump to section 2 — its fields render, section 1's no longer do.
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /Safety & Risk Management/i }),
    );
    expect(
      screen.getByLabelText(/fire exits adequate/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/roof condition/i)).not.toBeInTheDocument();

    // And section 4's fields are reachable too.
    await user.click(
      screen.getByRole("button", { name: /Liability Exposures/i }),
    );
    expect(screen.getByLabelText(/ada compliant/i)).toBeInTheDocument();
  });

  it("reloads previously saved state on refresh", async () => {
    mockApi({
      form: {
        roof_condition: "Fair",
        roof_age_years: 12,
        section1_notes: "Minor wear on the north slope.",
        // API returns booleans as 0/1 integers.
        fire_exits_adequate: 1,
      },
    });
    renderForm();

    expect(await screen.findByLabelText(/roof condition/i)).toHaveValue(
      "Fair",
    );
    expect(screen.getByLabelText(/roof age \(years\)/i)).toHaveValue(12);
    expect(screen.getByLabelText(/section notes/i)).toHaveValue(
      "Minor wear on the north slope.",
    );

    // Boolean 1 → the "Yes" option is selected after normalisation.
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /Safety & Risk Management/i }),
    );
    expect(screen.getByLabelText(/fire exits adequate/i)).toHaveValue(
      "true",
    );
  });

  it("saves a section via PUT with only that section's fields", async () => {
    const calls = mockApi();
    renderForm();
    const user = userEvent.setup();

    await user.selectOptions(
      await screen.findByLabelText(/roof condition/i),
      "Good",
    );
    await user.click(screen.getByRole("button", { name: /save section/i }));

    expect(await screen.findByText(/^Saved/)).toBeInTheDocument();
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe("/api/orders/ord-1/form");
    expect(put?.body).toMatchObject({ roof_condition: "Good" });
    // Section 1 only — no section 2 column leaks into the payload.
    expect(put?.body).not.toHaveProperty("fire_exits_adequate");
  });

  it("blocks submit and highlights the missing required fields", async () => {
    mockApi({
      submitMissing: ["roof_condition", "foundation_condition"],
    });
    renderForm();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: /submit inspection/i }),
    );

    expect(
      await screen.findByText(/can't be submitted yet/i),
    ).toBeInTheDocument();
    // The unanswered required fields show inline errors and stay on screen.
    expect(
      screen.getAllByText(/required to submit/i).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("DASHBOARD HOME")).not.toBeInTheDocument();
  });

  it("submits a complete inspection and returns to the dashboard", async () => {
    mockApi({ submitMissing: null });
    renderForm();
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: /submit inspection/i }),
    );

    expect(await screen.findByText("DASHBOARD HOME")).toBeInTheDocument();
  });
});
