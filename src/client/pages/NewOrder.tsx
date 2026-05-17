import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createOrder, type NewOrderInput } from "../api";

// Story 1: Jeff creates an inspection order. Desktop-first, single column,
// labeled inputs (a11y floor §5 — no placeholder-as-label). insured_name,
// property_address and property_use are required at the UI layer (PRD §8
// Risk 4 keeps the DB permissive for now).

interface FormState {
  insured_name: string;
  property_address: string;
  property_use: string;
  source: "" | "Policy" | "Claims";
  contact_name: string;
  contact_phone: string;
  assigned_inspector: string;
}

const EMPTY: FormState = {
  insured_name: "",
  property_address: "",
  property_use: "",
  source: "",
  contact_name: "",
  contact_phone: "",
  assigned_inspector: "",
};

const REQUIRED: (keyof FormState)[] = [
  "insured_name",
  "property_address",
  "property_use",
];

export function NewOrder() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    for (const key of REQUIRED) {
      if (!form[key].trim()) nextErrors[key] = "This field is required.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload: NewOrderInput = {
      insured_name: form.insured_name.trim(),
      property_address: form.property_address.trim(),
      property_use: form.property_use.trim(),
      ...(form.source ? { source: form.source } : {}),
      ...(form.contact_name.trim()
        ? { contact_name: form.contact_name.trim() }
        : {}),
      ...(form.contact_phone.trim()
        ? { contact_phone: form.contact_phone.trim() }
        : {}),
      ...(form.assigned_inspector.trim()
        ? { assigned_inspector: form.assigned_inspector.trim() }
        : {}),
    };

    setSubmitting(true);
    try {
      await createOrder(payload);
      navigate("/");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to create order.",
      );
      setSubmitting(false);
    }
  }

  function field(
    key: keyof FormState,
    label: string,
    opts: { required?: boolean; type?: string } = {},
  ) {
    const id = `field-${key}`;
    const hasError = errors[key];
    return (
      <div>
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-900"
        >
          {label}
          {opts.required && (
            <span className="text-red-600" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </label>
        <input
          id={id}
          type={opts.type ?? "text"}
          value={form[key]}
          required={opts.required}
          aria-required={opts.required}
          aria-invalid={hasError ? true : undefined}
          aria-describedby={hasError ? `${id}-error` : undefined}
          onChange={(e) => set(key, e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base shadow-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
        />
        {hasError && (
          <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
            {hasError}
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">New Order</h1>

      {submitError && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-300"
        >
          {submitError}
        </p>
      )}

      <form
        onSubmit={onSubmit}
        noValidate
        className="space-y-5 rounded-md bg-white p-6 shadow-sm ring-1 ring-gray-300"
      >
        {field("insured_name", "Insured name", { required: true })}
        {field("property_address", "Property address", { required: true })}
        {field("property_use", "Property use", { required: true })}

        <div>
          <label
            htmlFor="field-source"
            className="block text-sm font-medium text-gray-900"
          >
            Source
          </label>
          <select
            id="field-source"
            value={form.source}
            onChange={(e) =>
              set("source", e.target.value as FormState["source"])
            }
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base shadow-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
          >
            <option value="">— Not specified —</option>
            <option value="Policy">Policy</option>
            <option value="Claims">Claims</option>
          </select>
        </div>

        {field("contact_name", "Contact name")}
        {field("contact_phone", "Contact phone", { type: "tel" })}
        {field("assigned_inspector", "Assigned inspector")}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create order"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
