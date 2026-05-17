import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { NewOrder } from "./NewOrder";

function renderForm() {
  return render(
    <MemoryRouter initialEntries={["/orders/new"]}>
      <Routes>
        <Route path="/orders/new" element={<NewOrder />} />
        <Route path="/" element={<div>DASHBOARD HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("NewOrder", () => {
  it("submits the form and redirects to the Dashboard", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ id: "new-id" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderForm();

    await user.type(screen.getByLabelText(/insured name/i), "Acme Corp");
    await user.type(
      screen.getByLabelText(/property address/i),
      "1 Main St",
    );
    await user.type(screen.getByLabelText(/property use/i), "Warehouse");
    await user.click(screen.getByRole("button", { name: /create order/i }));

    // Redirected — the "/" route content is now on screen.
    expect(await screen.findByText("DASHBOARD HOME")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/orders");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      insured_name: "Acme Corp",
      property_address: "1 Main St",
      property_use: "Warehouse",
    });
  });

  it("blocks submit and shows errors when required fields are empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderForm();
    await user.click(screen.getByRole("button", { name: /create order/i }));

    expect(screen.getAllByText("This field is required.")).toHaveLength(3);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("DASHBOARD HOME")).not.toBeInTheDocument();
  });
});
