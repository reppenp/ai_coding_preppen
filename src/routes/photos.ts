import { Hono } from "hono";
import type { Env } from "../index";

// Photo-attachment API. Mounted at /api/orders by src/index.ts, so the live
// paths are:
//   POST /api/orders/:id/photos          — upload one photo to a section
//   GET  /api/orders/:id/photos          — list, grouped by section
//   GET  /api/orders/:id/photos/:photoId — stream the image bytes
//
// Story 6 (PRD §4). Upload is PROXIED through the Worker: the bytes go to R2
// (binding PHOTOS), the metadata + r2_key pointer go to D1. Chosen over
// presigned URLs because v1 photos are a handful of phone images per section
// ("uploaded per section, not batched" — PRD §7); one atomic retryable
// request is the right fit for John's poor-connectivity field work (PRD §8
// Risk 1) with no presign-expiry to manage. No auth in v1 (PRD §6).

const photos = new Hono<{ Bindings: Env }>();

// Typical inspection photo is 2–8 MB. Cap proxied uploads so a stray huge
// file can't blow the Worker's memory/CPU budget; revisit (presigned) only
// if real usage needs bigger. PRD §7 sets no per-photo size limit, so this is
// an implementation guard, not a product rule.
const MAX_BYTES = 15 * 1024 * 1024;

/** The order row, or null if the id doesn't exist. */
function loadOrder(env: Env, id: string) {
  return env.DB.prepare(`SELECT id FROM inspections WHERE id = ?`)
    .bind(id)
    .first<{ id: string }>();
}

interface PhotoRow {
  id: string;
  section: number;
  filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
}

/** Public shape: the row + the URL an <img> points at to stream the bytes. */
function toPhoto(orderId: string, r: PhotoRow) {
  return { ...r, url: `/api/orders/${orderId}/photos/${r.id}` };
}

// POST /api/orders/:id/photos — multipart/form-data: `section` (1..4) + `file`.
photos.post("/:id/photos", async (c) => {
  const id = c.req.param("id");
  if (!(await loadOrder(c.env, id))) {
    return c.json({ error: "order not found" }, 404);
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "expected multipart/form-data" }, 400);
  }

  const section = Number(form.get("section"));
  if (!Number.isInteger(section) || section < 1 || section > 4) {
    return c.json({ error: "section must be an integer 1–4" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "a `file` is required" }, 400);
  }
  if (!file.type.startsWith("image/")) {
    return c.json({ error: "file must be an image" }, 400);
  }
  if (file.size > MAX_BYTES) {
    return c.json(
      { error: `image exceeds the ${MAX_BYTES / (1024 * 1024)} MB limit` },
      400,
    );
  }

  const photoId = crypto.randomUUID();
  // Key namespaces by order + section so R2 is browsable and a photo maps to
  // exactly one object (r2_key is UNIQUE in D1). photoId keeps it collision-
  // free regardless of the original filename.
  const r2Key = `inspections/${id}/section-${section}/${photoId}`;

  await c.env.PHOTOS.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  // Bytes are safely in R2 before the D1 pointer is written — a crash here
  // leaves an orphan object, never a dangling row pointing at nothing.
  await c.env.DB.prepare(
    `INSERT INTO photos
       (id, inspection_id, section, r2_key, filename, content_type, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(photoId, id, section, r2Key, file.name, file.type, file.size)
    .run();

  const row = await c.env.DB.prepare(
    `SELECT id, section, filename, content_type, size_bytes, uploaded_at
       FROM photos WHERE id = ?`,
  )
    .bind(photoId)
    .first<PhotoRow>();

  return c.json({ ...toPhoto(id, row!), r2_key: r2Key }, 201);
});

// GET /api/orders/:id/photos — grouped by section so the form can show the
// active section's photos directly. Sections 1–4 are always present (empty
// arrays for sections with no photos yet) so the UI never special-cases.
photos.get("/:id/photos", async (c) => {
  const id = c.req.param("id");
  if (!(await loadOrder(c.env, id))) {
    return c.json({ error: "order not found" }, 404);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, section, filename, content_type, size_bytes, uploaded_at
       FROM photos WHERE inspection_id = ?
       ORDER BY uploaded_at ASC, id ASC`,
  )
    .bind(id)
    .all<PhotoRow>();

  const bySection: Record<string, ReturnType<typeof toPhoto>[]> = {
    "1": [],
    "2": [],
    "3": [],
    "4": [],
  };
  for (const r of results) bySection[String(r.section)].push(toPhoto(id, r));

  return c.json({ bySection });
});

// GET /api/orders/:id/photos/:photoId — stream the bytes from R2. R2 objects
// are private; serving through the Worker is how the SPA's <img> renders them
// without exposing the bucket. (Necessary addition — see BUILDPLAN log.)
photos.get("/:id/photos/:photoId", async (c) => {
  const id = c.req.param("id");
  const photoId = c.req.param("photoId");

  const row = await c.env.DB.prepare(
    `SELECT r2_key, content_type FROM photos
       WHERE id = ? AND inspection_id = ?`,
  )
    .bind(photoId, id)
    .first<{ r2_key: string; content_type: string | null }>();
  if (!row) return c.json({ error: "photo not found" }, 404);

  const obj = await c.env.PHOTOS.get(row.r2_key);
  if (!obj) return c.json({ error: "photo not found" }, 404);

  return new Response(obj.body, {
    headers: {
      "content-type": row.content_type ?? "application/octet-stream",
      "cache-control": "private, max-age=3600",
    },
  });
});

export default photos;
