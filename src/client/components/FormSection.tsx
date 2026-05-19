import type { ReactNode } from "react";

// Reusable wrapper for one inspection section: heading, the section's fields
// (children), and an EXPLICIT "Save section" button with a visible save state.
//
// Explicit per-section save (not blur-debounce) is the BUILDPLAN Phase 2 risk
// resolution: it maps 1:1 to PUT /api/orders/:id/form and makes the save state
// obvious to John in poor connectivity (PRD §8 Risk 1) — he can see a section
// is safely stored before moving on or losing signal.

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface FormSectionProps {
  title: string;
  index: number; // 0-based
  total: number;
  saveState: SaveState;
  saveError?: string | null;
  savedAt?: string | null;
  onSave: () => void;
  children: ReactNode;
}

/** updated_at is SQLite "YYYY-MM-DD HH:MM:SS" UTC — show a local clock time. */
function formatSavedAt(value: string): string {
  const d = new Date(value.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function SaveStatus({
  state,
  error,
  savedAt,
}: {
  state: SaveState;
  error?: string | null;
  savedAt?: string | null;
}) {
  if (state === "error") {
    return (
      <p role="alert" className="text-sm text-red-600">
        {error ?? "Save failed — your changes are not stored yet."}
      </p>
    );
  }
  if (state === "saving") {
    return <p className="text-sm text-gray-600">Saving…</p>;
  }
  if (state === "dirty") {
    return (
      <p className="text-sm text-yellow-700">
        Unsaved changes in this section.
      </p>
    );
  }
  if (state === "saved") {
    return (
      <p className="text-sm text-green-600">
        Saved{savedAt ? ` · ${formatSavedAt(savedAt)}` : ""}.
      </p>
    );
  }
  return <p className="text-sm text-gray-600">No changes yet.</p>;
}

export function FormSection({
  title,
  index,
  total,
  saveState,
  saveError,
  savedAt,
  onSave,
  children,
}: FormSectionProps) {
  const saveDisabled = saveState === "saving" || saveState === "saved" || saveState === "idle";

  return (
    <section
      aria-labelledby={`section-${index}-heading`}
      className="rounded-md bg-white p-6 shadow-sm ring-1 ring-gray-300"
    >
      <header className="mb-5 border-b border-gray-300 pb-4">
        <p className="text-sm font-medium text-gray-600">
          Section {index + 1} of {total}
        </p>
        <h2
          id={`section-${index}-heading`}
          className="mt-1 text-xl font-semibold text-gray-900"
        >
          {title}
        </h2>
      </header>

      <div className="space-y-5">{children}</div>

      <footer className="mt-6 flex items-center justify-between border-t border-gray-300 pt-4">
        <SaveStatus state={saveState} error={saveError} savedAt={savedAt} />
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saveState === "saving" ? "Saving…" : "Save section"}
        </button>
      </footer>
    </section>
  );
}
