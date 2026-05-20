import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  loadForm,
  listPhotos,
  loadDecision,
  recordDecision,
  type Decision,
  type FormOrderMeta,
  type FormValues,
  type Photo,
  type PolicyAction,
  type PremiumDirection,
} from "../api";
import { StatusBadge } from "../components/StatusBadge";
import {
  SECTIONS,
  formatValue,
  normalizeLoaded,
} from "../form-spec";

// Phase 4 — Story 3 detail view: Kelly opens one submitted inspection, reads
// the report (form answers + photos, read-only), and records a decision.
//
// The report is rendered straight from the same field spec the editable form
// uses (../form-spec.ts) so the two views can never drift. Decision form lives
// inline at the bottom — submit it and the page bounces back to the queue.
//
// Loaded eagerly in parallel: order/form + photos + existing decision. A
// previously recorded decision pre-fills the form so a "second look" is
// editable (the POST upserts on UNIQUE(inspection_id)).

const PREMIUM_OPTIONS: { value: PremiumDirection; label: string }[] = [
  { value: "increase", label: "Increase" },
  { value: "decrease", label: "Decrease" },
  { value: "no change", label: "No change" },
];

const POLICY_OPTIONS: { value: PolicyAction; label: string }[] = [
  { value: "approve", label: "Approve" },
  { value: "cancel", label: "Cancel" },
  { value: "renew", label: "Renew" },
];

export function ReviewDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [meta, setMeta] = useState<FormOrderMeta | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [photos, setPhotos] = useState<Record<string, Photo[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const [premium, setPremium] = useState<PremiumDirection | "">("");
  const [policy, setPolicy] = useState<PolicyAction | "">("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadForm(id), listPhotos(id), loadDecision(id)])
      .then(([form, ph, decision]: [
        Awaited<ReturnType<typeof loadForm>>,
        Record<string, Photo[]>,
        Decision | null,
      ]) => {
        if (cancelled) return;
        setMeta(form.order);
        setValues(normalizeLoaded(form.form));
        setPhotos(ph);
        if (decision) {
          setPremium(decision.premium_direction);
          setPolicy(decision.policy_action);
          setNotes(decision.notes ?? "");
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Failed to load inspection.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!premium || !policy) {
      setSubmitError("Choose a premium direction and a policy action.");
      return;
    }
    setSubmitting(true);
    try {
      await recordDecision(id, {
        premium_direction: premium,
        policy_action: policy,
        notes: notes.trim() || undefined,
      });
      navigate("/review");
    } catch (e2) {
      setSubmitError(
        e2 instanceof Error ? e2.message : "Failed to record decision.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <section className="mx-auto max-w-3xl">
        <p
          role="alert"
          className="rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-300"
        >
          {loadError}
        </p>
      </section>
    );
  }

  if (!meta) {
    return <p className="text-gray-600">Loading inspection…</p>;
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">
            {meta.insured_name}
          </h1>
          <StatusBadge status={meta.status} />
        </div>
        <p className="mt-1 text-sm text-gray-600">
          {meta.property_address}
          {meta.property_use ? ` · ${meta.property_use}` : ""}
        </p>
      </header>

      {/* Read-only report: same section structure as the editable form. */}
      {SECTIONS.map((section, i) => {
        const sectionPhotos = photos[String(i + 1)] ?? [];
        return (
          <article
            key={section.title}
            aria-labelledby={`report-section-${i}`}
            className="rounded-md bg-white p-6 shadow-sm ring-1 ring-gray-300"
          >
            <header className="mb-5 border-b border-gray-300 pb-4">
              <p className="text-sm font-medium text-gray-600">
                Section {i + 1} of {SECTIONS.length}
              </p>
              <h2
                id={`report-section-${i}`}
                className="mt-1 text-xl font-semibold text-gray-900"
              >
                {section.title}
              </h2>
            </header>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {section.fields.map((def) => {
                const formatted = formatValue(def, values[def.name] ?? null);
                return (
                  <div
                    key={def.name}
                    className={def.multiline ? "sm:col-span-2" : ""}
                  >
                    <dt className="text-sm font-medium text-gray-600">
                      {def.label}
                    </dt>
                    <dd
                      className={`mt-1 text-base text-gray-900 ${
                        def.multiline ? "whitespace-pre-wrap" : ""
                      }`}
                    >
                      {formatted}
                    </dd>
                  </div>
                );
              })}
            </dl>

            {sectionPhotos.length > 0 && (
              <div className="mt-6 border-t border-gray-300 pt-4">
                <p className="mb-3 text-sm font-medium text-gray-600">
                  Photos ({sectionPhotos.length})
                </p>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {sectionPhotos.map((p) => (
                    <li key={p.id}>
                      <img
                        src={p.url}
                        alt={p.filename ?? "Inspection photo"}
                        className="h-32 w-full rounded-md object-cover ring-1 ring-gray-300"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        );
      })}

      {/* Decision form (Story 3). Premium direction + policy action are
          required; notes optional. Two button-group fieldsets so the choice
          is obvious in one glance — labels also carry the value text, not just
          color (a11y floor §5). */}
      <form
        onSubmit={onSubmit}
        aria-labelledby="decision-heading"
        className="rounded-md bg-white p-6 shadow-sm ring-1 ring-gray-300"
      >
        <h2
          id="decision-heading"
          className="text-xl font-semibold text-gray-900"
        >
          Underwriting decision
        </h2>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-gray-900">
            Premium direction
            <span className="text-red-600" aria-hidden="true">
              {" "}
              *
            </span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {PREMIUM_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`cursor-pointer rounded-md px-3 py-2 text-sm font-medium ring-1 ring-inset ${
                  premium === opt.value
                    ? "bg-blue-700 text-white ring-blue-700"
                    : "bg-white text-gray-900 ring-gray-300 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="premium_direction"
                  value={opt.value}
                  checked={premium === opt.value}
                  onChange={() => setPremium(opt.value)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-gray-900">
            Policy action
            <span className="text-red-600" aria-hidden="true">
              {" "}
              *
            </span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {POLICY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`cursor-pointer rounded-md px-3 py-2 text-sm font-medium ring-1 ring-inset ${
                  policy === opt.value
                    ? "bg-blue-700 text-white ring-blue-700"
                    : "bg-white text-gray-900 ring-gray-300 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="policy_action"
                  value={opt.value}
                  checked={policy === opt.value}
                  onChange={() => setPolicy(opt.value)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5">
          <label
            htmlFor="decision-notes"
            className="block text-sm font-medium text-gray-900"
          >
            Notes &amp; recommendations
          </label>
          <textarea
            id="decision-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base shadow-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
          />
        </div>

        {submitError && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-300"
          >
            {submitError}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-700 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60"
          >
            {submitting ? "Recording…" : "Record decision"}
          </button>
        </div>
      </form>
    </section>
  );
}
