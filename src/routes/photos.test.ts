import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import app from "../index";

// Phase 3 — Story 6: John attaches photos to each inspection section. Upload
// is proxied through the Worker (bytes → R2 binding PHOTOS, metadata → D1).
// R2 is simulated in-memory by miniflare via the wrangler.toml binding, so
// these run with no real Cloudflare.

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

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

function upload(
  id: string,
  section: string,
  file: { bytes?: Uint8Array; type?: string; name?: string } | "no-file" = {},
) {
  const fd = new FormData();
  fd.set("section", section);
  if (file !== "no-file") {
    const blob = new Blob([(file.bytes ?? PNG_BYTES) as BlobPart], {
      type: file.type ?? "image/png",
    });
    fd.set("file", blob, file.name ?? "roof.png");
  }
  return call(
    new Request(`http://localhost/api/orders/${id}/photos`, {
      method: "POST",
      body: fd,
    }),
  );
}

function listPhotos(id: string) {
  return call(new Request(`http://localhost/api/orders/${id}/photos`));
}

interface Photo {
  id: string;
  section: number;
  filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
  url: string;
}

describe("POST /api/orders/:id/photos", () => {
  it("404s for an unknown order", async () => {
    const res = await upload("does-not-exist", "1");
    expect(res.status).toBe(404);
  });

  it("400s when no file is supplied", async () => {
    const id = await newOrder();
    const res = await upload(id, "1", "no-file");
    expect(res.status).toBe(400);
  });

  it("400s on a non-image file", async () => {
    const id = await newOrder();
    const res = await upload(id, "1", { type: "application/pdf", name: "x.pdf" });
    expect(res.status).toBe(400);
  });

  it("400s on a section outside 1..4", async () => {
    const id = await newOrder();
    expect((await upload(id, "0")).status).toBe(400);
    expect((await upload(id, "5")).status).toBe(400);
    expect((await upload(id, "two")).status).toBe(400);
  });

  it("stores the bytes in R2, a row in D1, and returns 201 + r2_key", async () => {
    const id = await newOrder();
    const res = await upload(id, "2", { name: "wall.png" });
    expect(res.status).toBe(201);

    const photo = (await res.json()) as Photo & { r2_key: string };
    expect(photo.id).toBeTruthy();
    expect(photo.section).toBe(2);
    expect(photo.filename).toBe("wall.png");
    expect(photo.content_type).toBe("image/png");
    expect(photo.size_bytes).toBe(PNG_BYTES.byteLength);
    expect(typeof photo.r2_key).toBe("string");
    expect(photo.r2_key.length).toBeGreaterThan(0);

    // Bytes actually landed in the R2 binding under that key.
    const obj = await env.PHOTOS.get(photo.r2_key);
    expect(obj).not.toBeNull();
    expect(new Uint8Array(await obj!.arrayBuffer())).toEqual(PNG_BYTES);
  });
});

describe("GET /api/orders/:id/photos", () => {
  it("404s for an unknown order", async () => {
    const res = await listPhotos("does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns the photo list grouped by section", async () => {
    const id = await newOrder();
    await upload(id, "1", { name: "a.png" });
    await upload(id, "1", { name: "b.png" });
    await upload(id, "3", { name: "c.png" });

    const res = await listPhotos(id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bySection: Record<string, Photo[]> };

    expect(body.bySection["1"].map((p) => p.filename).sort()).toEqual([
      "a.png",
      "b.png",
    ]);
    expect(body.bySection["3"]).toHaveLength(1);
    expect(body.bySection["2"]).toEqual([]);
    expect(body.bySection["4"]).toEqual([]);
    // Each photo carries a streaming URL the <img> can point at.
    expect(body.bySection["1"][0].url).toBe(
      `/api/orders/${id}/photos/${body.bySection["1"][0].id}`,
    );
  });
});

describe("GET /api/orders/:id/photos/:photoId", () => {
  it("streams the stored bytes with the original content-type", async () => {
    const id = await newOrder();
    const photo = (await (
      await upload(id, "4", { name: "lot.png" })
    ).json()) as Photo;

    const res = await call(new Request(`http://localhost${photo.url}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("404s for an unknown photo id", async () => {
    const id = await newOrder();
    const res = await call(
      new Request(`http://localhost/api/orders/${id}/photos/nope`),
    );
    expect(res.status).toBe(404);
  });
});
