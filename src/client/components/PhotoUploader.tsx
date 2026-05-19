import { useEffect, useRef, useState } from "react";
import { listPhotos, uploadPhoto, type Photo } from "../api";

// Story 6: John attaches photos to each inspection section so Kelly has
// visual evidence behind the written findings. Built from scratch as a
// drag-and-drop input (DESIGN §3 — "file uploader … build from scratch").
//
// Accessibility floor (DESIGN §5): drag-and-drop is a mouse ENHANCEMENT, not
// the only path — a real labelled <input type="file"> + a visible "Choose
// photos" button are the keyboard route. Progress/errors are conveyed in
// text, not by colour alone.
//
// Self-contained per section: it owns its fetch (the form renders one section
// at a time, so only the active section's uploader is mounted) and refreshes
// after each upload — no page reload, matching the BUILDPLAN done-when.

interface PhotoUploaderProps {
  inspectionId: string;
  section: number; // 1..4
}

interface Pending {
  name: string;
  error: string | null;
}

export function PhotoUploader({ inspectionId, section }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    listPhotos(inspectionId)
      .then((bySection) => {
        if (!cancelled) setPhotos(bySection[String(section)] ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Couldn't load photos.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inspectionId, section]);

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length === 0) return;

    // Mark every file in-flight up front so John sees all of them queued even
    // on a slow connection; upload sequentially so one failure is isolated.
    setPending(files.map((f) => ({ name: f.name, error: null })));
    for (const file of files) {
      try {
        const photo = await uploadPhoto(inspectionId, section, file);
        setPhotos((p) => [...p, photo]);
        setPending((q) => q.filter((x) => x.name !== file.name));
      } catch (e) {
        setPending((q) =>
          q.map((x) =>
            x.name === file.name
              ? {
                  ...x,
                  error:
                    e instanceof Error ? e.message : "Upload failed.",
                }
              : x,
          ),
        );
      }
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    void handleFiles(e.dataTransfer.files);
  }

  const inputId = `photo-input-${section}`;

  return (
    <section
      aria-labelledby={`photos-${section}-heading`}
      className="rounded-md border border-gray-300 bg-gray-50 p-4"
    >
      <h3
        id={`photos-${section}-heading`}
        className="text-sm font-medium text-gray-900"
      >
        Section photos
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        Attach photos as visual evidence for this section. Drag images here or
        choose them below.
      </p>

      {/* Drop zone — mouse enhancement. The input + button below are the
          keyboard path, so this div is intentionally not a tab stop. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`mt-3 flex flex-col items-center gap-3 rounded-md border-2 border-dashed px-4 py-6 text-center ${
          dragOver
            ? "border-blue-700 bg-blue-50"
            : "border-gray-300 bg-white"
        }`}
      >
        <p className="text-sm text-gray-600">
          {dragOver ? "Drop to upload" : "Drag & drop images here"}
        </p>
        <label htmlFor={inputId} className="sr-only">
          Add photos to section {section}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          Choose photos
        </button>
      </div>

      {loadError && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {loadError}
        </p>
      )}

      {pending.length > 0 && (
        <ul className="mt-3 space-y-1">
          {pending.map((p) => (
            <li key={p.name} className="text-sm">
              {p.error ? (
                <span role="alert" className="text-red-600">
                  {p.name}: {p.error}
                </span>
              ) : (
                <span className="text-gray-600">Uploading {p.name}…</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {photos.length > 0 && (
        <ul className="mt-4 grid grid-cols-3 gap-3">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="overflow-hidden rounded-md border border-gray-300 bg-white"
            >
              <img
                src={photo.url}
                alt={photo.filename ?? "Inspection photo"}
                className="h-28 w-full object-cover"
              />
              <p className="truncate px-2 py-1 text-sm text-gray-600">
                {photo.filename ?? "photo"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
