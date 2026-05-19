import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhotoUploader } from "./PhotoUploader";

// Phase 3 component test (BUILDPLAN): the uploader renders, accepts a file,
// fires the upload handler, and the new photo appears with no page refresh.

interface Opts {
  initial?: Record<string, unknown[]>;
  uploadFails?: boolean;
}

function mockApi({ initial = {}, uploadFails = false }: Opts = {}) {
  const calls: { url: string; method: string; section?: string }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body;
    const section =
      body instanceof FormData ? String(body.get("section")) : undefined;
    calls.push({ url, method, section });

    if (method === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          bySection: { "1": [], "2": [], "3": [], "4": [], ...initial },
        }),
      };
    }
    // POST /photos
    if (uploadFails) {
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: "file must be an image" }),
      };
    }
    return {
      ok: true,
      status: 201,
      json: async () => ({
        id: "ph-new",
        section: 1,
        filename: "roof.png",
        content_type: "image/png",
        size_bytes: 10,
        uploaded_at: "2026-05-19 10:30:00",
        url: "/api/orders/ord-1/photos/ph-new",
      }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const pngFile = () =>
  new File([new Uint8Array([1, 2, 3])], "roof.png", { type: "image/png" });

describe("PhotoUploader", () => {
  it("renders the drop zone and any already-uploaded photos for the section", async () => {
    mockApi({
      initial: {
        "1": [
          {
            id: "ph-0",
            section: 1,
            filename: "existing.png",
            content_type: "image/png",
            size_bytes: 5,
            uploaded_at: "2026-05-19 09:00:00",
            url: "/api/orders/ord-1/photos/ph-0",
          },
        ],
      },
    });
    render(<PhotoUploader inspectionId="ord-1" section={1} />);

    expect(
      screen.getByRole("button", { name: /choose photos/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: "existing.png" }),
    ).toBeInTheDocument();
  });

  it("accepts a file, fires the upload, and shows the photo without a refresh", async () => {
    const calls = mockApi();
    render(<PhotoUploader inspectionId="ord-1" section={1} />);
    const user = userEvent.setup();

    await user.upload(
      screen.getByLabelText(/add photos to section 1/i),
      pngFile(),
    );

    const post = await waitFor(() => {
      const c = calls.find((x) => x.method === "POST");
      expect(c).toBeTruthy();
      return c!;
    });
    expect(post.url).toBe("/api/orders/ord-1/photos");
    expect(post.section).toBe("1");

    // The returned photo is rendered with no extra GET / page reload.
    expect(
      await screen.findByRole("img", { name: "roof.png" }),
    ).toBeInTheDocument();
  });

  it("surfaces an upload error in text (not colour alone)", async () => {
    mockApi({ uploadFails: true });
    render(<PhotoUploader inspectionId="ord-1" section={2} />);
    const user = userEvent.setup();

    await user.upload(
      screen.getByLabelText(/add photos to section 2/i),
      pngFile(),
    );

    expect(
      await screen.findByText(/roof\.png:.*file must be an image/i),
    ).toBeInTheDocument();
  });
});
