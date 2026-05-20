import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ReviewDetail } from "./ReviewDetail";

// Phase 4 — Story 3 component tests:
//   - Renders the inspection report read-only (form values + photos).
//   - Records a decision via POST and bounces back to the queue.

interface Handlers {
  form?: Record<string, unknown>;
  decision?: unknown; // null/undefined → no prior decision
  photos?: Record<string, { id: string; section: number; url: string; filename: string }[]>;
}

function mockApi({ form = {}, decision = null, photos = {} }: Handlers = {}) {
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
            status: "Submitted",
            insured_name: "Maria's Tacos LLC",
            property_address: "123 Market St",
            property_use: "Restaurant",
          },
          form,
        }),
      };
    }
    if (method === "GET" && url.endsWith("/photos")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          bySection: { "1": [], "2": [], "3": [], "4": [], ...photos },
        }),
      };
    }
    if (method === "GET" && url.endsWith("/decision")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ decision }),
      };
    }
    if (method === "POST" && url.endsWith("/decision")) {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          ok: true,
          status: "Reviewed",
          decision: {
            id: "dec-1",
            inspection_id: "ord-1",
            premium_direction: "increase",
            policy_action: "renew",
            notes: null,
            decided_by: null,
            created_at: "2026-05-19 12:00:00",
          },
        }),
      };
    }
    throw new Error(`unexpected fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/review/ord-1"]}>
      <Routes>
        <Route path="/review/:id" element={<ReviewDetail />} />
        <Route path="/review" element={<div>REVIEW QUEUE HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("ReviewDetail", () => {
  it("renders the inspection report read-only with all four sections", async () => {
    mockApi({
      form: {
        roof_condition: "Fair",
        roof_age_years: 12,
        // The API returns booleans as 0/1 integers.
        fire_exits_adequate: 1,
        hazardous_materials_present: 0,
        occupancy_type: "Leased",
        section1_notes: "Minor wear on the north slope.",
      },
    });
    renderDetail();

    // All four section headings render.
    for (const title of [
      "Building Structure & Maintenance",
      "Safety & Risk Management",
      "Occupancy & Usage",
      "Liability Exposures",
    ]) {
      expect(
        await screen.findByRole("heading", { name: title }),
      ).toBeInTheDocument();
    }

    // Values come back in their human form, not 0/1.
    expect(screen.getByText("Fair")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    // fire_exits_adequate = 1 → "Yes"; hazardous_materials_present = 0 → "No".
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("Leased")).toBeInTheDocument();
    expect(
      screen.getByText("Minor wear on the north slope."),
    ).toBeInTheDocument();

    // No editable controls in the report — there is no <input> for
    // roof_condition the way the editable form has.
    expect(
      screen.queryByLabelText(/roof condition/i),
    ).not.toBeInTheDocument();
  });

  it("shows uploaded photos under their section", async () => {
    mockApi({
      photos: {
        "1": [
          {
            id: "p1",
            section: 1,
            url: "/api/orders/ord-1/photos/p1",
            filename: "roof.png",
          },
        ],
      },
    });
    renderDetail();

    const img = await screen.findByAltText("roof.png");
    expect(img).toHaveAttribute("src", "/api/orders/ord-1/photos/p1");
  });

  it("records a decision and returns to the queue", async () => {
    const calls = mockApi();
    renderDetail();
    const user = userEvent.setup();

    // Wait for the page to settle so the decision form is mounted.
    await screen.findByRole("heading", { name: /underwriting decision/i });

    await user.click(screen.getByRole("radio", { name: /increase/i }));
    await user.click(screen.getByRole("radio", { name: /renew/i }));
    await user.type(
      screen.getByLabelText(/notes/i),
      "Roof at end of life.",
    );
    await user.click(
      screen.getByRole("button", { name: /record decision/i }),
    );

    expect(
      await screen.findByText("REVIEW QUEUE HOME"),
    ).toBeInTheDocument();

    const post = calls.find(
      (c) => c.method === "POST" && c.url.endsWith("/decision"),
    );
    expect(post?.url).toBe("/api/orders/ord-1/decision");
    expect(post?.body).toEqual({
      premium_direction: "increase",
      policy_action: "renew",
      notes: "Roof at end of life.",
    });
  });

  it("blocks submit when premium or policy is missing", async () => {
    mockApi();
    renderDetail();
    const user = userEvent.setup();

    await screen.findByRole("heading", { name: /underwriting decision/i });
    await user.click(
      screen.getByRole("button", { name: /record decision/i }),
    );

    expect(
      await screen.findByText(/choose a premium direction and a policy action/i),
    ).toBeInTheDocument();
    // Still on the detail page.
    expect(screen.queryByText("REVIEW QUEUE HOME")).not.toBeInTheDocument();
  });

  it("pre-fills the form when a decision already exists", async () => {
    mockApi({
      decision: {
        id: "dec-1",
        inspection_id: "ord-1",
        premium_direction: "decrease",
        policy_action: "cancel",
        notes: "Reconsidered after follow-up.",
        decided_by: null,
        created_at: "2026-05-19 12:00:00",
      },
    });
    renderDetail();

    // The radios reflect the saved decision after load.
    const decrease = await screen.findByRole("radio", { name: /decrease/i });
    expect(decrease).toBeChecked();
    expect(screen.getByRole("radio", { name: /cancel/i })).toBeChecked();
    expect(screen.getByLabelText(/notes/i)).toHaveValue(
      "Reconsidered after follow-up.",
    );

    // Sanity: the other premium radios are not checked.
    expect(
      within(screen.getByRole("radio", { name: /increase/i })).queryByRole(
        "radio",
      ),
    ).toBeNull();
    expect(screen.getByRole("radio", { name: /increase/i })).not.toBeChecked();
  });
});
