import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  loadForm,
  saveFormSection,
  submitForm,
  SubmitIncompleteError,
  type FormOrderMeta,
  type FormValue,
  type FormValues,
} from "../api";
import { StatusBadge } from "../components/StatusBadge";
import {
  ProgressIndicator,
  type SectionStatus,
} from "../components/ProgressIndicator";
import { FormSection, type SaveState } from "../components/FormSection";

// Story 2: John opens an assigned order and completes the 4-section field
// inspection. Stepped layout + progress rail (DESIGN.md §7) so a long form
// stays navigable. Each section saves explicitly to PUT .../form; the 8
// required fields (PRD §5) are gated at submit, surfaced inline if missing.

type FieldType = "cond" | "occupancy" | "traffic" | "bool" | "int" | "text";

interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean; // one of the 8 required-to-submit fields (PRD §5)
  multiline?: boolean; // text rendered as <textarea>
}

interface SectionDef {
  title: string;
  fields: FieldDef[];
}

// Mirrors PRD §5 / src/routes/forms.ts FIELDS exactly (order + types). The
// `required` flags are the 8-field submit gate, nothing else.
const SECTIONS: SectionDef[] = [
  {
    title: "Building Structure & Maintenance",
    fields: [
      { name: "roof_condition", label: "Roof condition", type: "cond", required: true },
      { name: "roof_age_years", label: "Roof age (years)", type: "int" },
      { name: "roof_materials", label: "Roof materials", type: "text" },
      { name: "exterior_walls_condition", label: "Exterior walls condition", type: "cond" },
      { name: "foundation_condition", label: "Foundation condition", type: "cond", required: true },
      { name: "windows_condition", label: "Windows condition", type: "cond" },
      { name: "hvac_condition", label: "HVAC condition", type: "cond" },
      { name: "plumbing_condition", label: "Plumbing condition", type: "cond" },
      { name: "electrical_condition", label: "Electrical condition", type: "cond", required: true },
      { name: "section1_notes", label: "Section notes", type: "text", multiline: true },
    ],
  },
  {
    title: "Safety & Risk Management",
    fields: [
      { name: "fire_exits_adequate", label: "Fire exits adequate", type: "bool", required: true },
      { name: "fire_exits_notes", label: "Fire exits notes", type: "text", multiline: true },
      { name: "security_systems_present", label: "Security systems present", type: "bool" },
      { name: "security_systems", label: "Security systems (cameras / lighting / alarms)", type: "text", multiline: true },
      { name: "hazardous_materials_present", label: "Hazardous materials present", type: "bool", required: true },
      { name: "hazardous_materials_storage", label: "Hazardous materials storage practices", type: "text", multiline: true },
      { name: "slip_trip_fall_adequate", label: "Slip / trip / fall controls adequate", type: "bool" },
      { name: "slip_trip_fall_notes", label: "Slip / trip / fall notes", type: "text", multiline: true },
      { name: "fire_suppression_present", label: "Fire suppression present", type: "bool", required: true },
      { name: "fire_suppression_systems", label: "Fire suppression systems (describe)", type: "text", multiline: true },
      { name: "section2_notes", label: "Section notes", type: "text", multiline: true },
    ],
  },
  {
    title: "Occupancy & Usage",
    fields: [
      { name: "tenant_types", label: "Tenant types", type: "text" },
      { name: "occupancy_type", label: "Occupancy type", type: "occupancy", required: true },
      { name: "foot_traffic_volume", label: "Foot traffic volume", type: "traffic" },
      { name: "high_risk_processes_present", label: "High-risk processes present", type: "bool", required: true },
      { name: "high_risk_processes", label: "High-risk processes (welding, cooking, manufacturing, …)", type: "text", multiline: true },
      { name: "section3_notes", label: "Section notes", type: "text", multiline: true },
    ],
  },
  {
    title: "Liability Exposures",
    fields: [
      { name: "parking_sidewalk_condition", label: "Parking / sidewalk condition", type: "cond" },
      { name: "ada_compliant", label: "ADA compliant", type: "bool" },
      { name: "ada_notes", label: "ADA notes", type: "text", multiline: true },
      { name: "public_safety_protocols", label: "Public safety protocols", type: "text", multiline: true },
      { name: "safety_training_present", label: "Safety training present", type: "bool" },
      { name: "safety_training_programs", label: "Safety training programs (describe)", type: "text", multiline: true },
      { name: "section4_notes", label: "Section notes", type: "text", multiline: true },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);

const ENUM_OPTIONS: Record<"cond" | "occupancy" | "traffic", string[]> = {
  cond: ["Good", "Fair", "Poor", "N-A"],
  occupancy: ["Owner-occupied", "Leased", "Multi-tenant"],
  traffic: ["Low", "Medium", "High"],
};

/** Coerce one field's UI value to what the API/D1 expects (or null to clear).
 *  Used both for the save payload and for dirty detection so a typed-then-
 *  cleared text field reads as "unchanged", not "unsaved". */
function toWire(def: FieldDef, raw: FormValue | undefined): FormValue {
  if (raw === undefined || raw === null || raw === "") return null;
  switch (def.type) {
    case "bool":
      return raw === true ? true : raw === false ? false : null;
    case "int": {
      const n = typeof raw === "string" ? Number(raw) : raw;
      return typeof n === "number" && Number.isFinite(n) ? n : null;
    }
    case "text":
      return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
    default:
      return raw; // cond / occupancy / traffic — already a valid enum string
  }
}

/** API returns booleans as 0/1 integers; everything else as-is. Normalise
 *  into the shape the controls bind to (true/false/null for bools). */
function normalizeLoaded(form: FormValues): FormValues {
  const out: FormValues = {};
  for (const def of ALL_FIELDS) {
    const v = form[def.name];
    if (def.type === "bool") {
      out[def.name] = v === 1 || v === true ? true : v === 0 || v === false ? false : null;
    } else {
      out[def.name] = v ?? null;
    }
  }
  return out;
}

interface SectionPhase {
  phase: "idle" | "saving" | "saved" | "error";
  error: string | null;
  savedAt: string | null;
}

const FRESH_PHASE: SectionPhase = { phase: "idle", error: null, savedAt: null };

export function InspectionForm() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [meta, setMeta] = useState<FormOrderMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [saved, setSaved] = useState<FormValues>({});
  const [active, setActive] = useState(0);
  const [phases, setPhases] = useState<SectionPhase[]>(
    SECTIONS.map(() => ({ ...FRESH_PHASE })),
  );
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadForm(id)
      .then((res) => {
        if (cancelled) return;
        setMeta(res.order);
        const norm = normalizeLoaded(res.form);
        setValues(norm);
        setSaved(norm);
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

  function isDirty(sectionIndex: number): boolean {
    return SECTIONS[sectionIndex].fields.some(
      (f) => toWire(f, values[f.name]) !== toWire(f, saved[f.name]),
    );
  }

  function saveState(i: number): SaveState {
    const p = phases[i];
    if (p.phase === "saving") return "saving";
    if (p.phase === "error") return "error";
    if (isDirty(i)) return "dirty";
    if (p.phase === "saved") return "saved";
    return "idle";
  }

  // Section "complete" = all of ITS required fields are answered. The submit
  // gate (PRD §5) only lives in sections 1–3; section 4 has none, so it reads
  // complete as soon as it loads — matching what submit actually enforces.
  const sectionStatuses: SectionStatus[] = useMemo(
    () =>
      SECTIONS.map((s) =>
        s.fields
          .filter((f) => f.required)
          .every((f) => toWire(f, values[f.name]) !== null)
          ? "complete"
          : "incomplete",
      ),
    [values],
  );

  function setField(name: string, value: FormValue) {
    setValues((v) => ({ ...v, [name]: value }));
    if (missing.size > 0) {
      setMissing((m) => {
        if (!m.has(name)) return m;
        const next = new Set(m);
        next.delete(name);
        return next;
      });
    }
  }

  function setPhase(i: number, patch: Partial<SectionPhase>) {
    setPhases((ps) => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  async function saveSection(i: number): Promise<boolean> {
    const payload: FormValues = {};
    for (const f of SECTIONS[i].fields) payload[f.name] = toWire(f, values[f.name]);

    setPhase(i, { phase: "saving", error: null });
    try {
      const res = await saveFormSection(id, payload);
      // Persist the just-saved values as the new baseline so dirty resets.
      setSaved((s) => {
        const next = { ...s };
        for (const f of SECTIONS[i].fields) next[f.name] = values[f.name];
        return next;
      });
      setPhase(i, { phase: "saved", error: null, savedAt: res.updated_at });
      // First save flips Ordered → In Progress server-side; reflect it.
      setMeta((m) =>
        m && m.status === "Ordered" ? { ...m, status: "In Progress" } : m,
      );
      return true;
    } catch (e) {
      setPhase(i, {
        phase: "error",
        error: e instanceof Error ? e.message : "Save failed.",
      });
      return false;
    }
  }

  async function onSubmit() {
    setSubmitError(null);
    setMissing(new Set());
    setSubmitting(true);
    try {
      // Don't lose work: flush every dirty section before submitting.
      for (let i = 0; i < SECTIONS.length; i++) {
        if (isDirty(i)) {
          const ok = await saveSection(i);
          if (!ok) {
            setActive(i);
            setSubmitError(
              "Couldn't save your latest changes — fix the error above and try again.",
            );
            return;
          }
        }
      }
      const res = await submitForm(id);
      setMeta((m) => (m ? { ...m, status: res.status } : m));
      navigate("/");
    } catch (e) {
      if (e instanceof SubmitIncompleteError) {
        const miss = new Set(e.missing);
        setMissing(miss);
        const firstSection = SECTIONS.findIndex((s) =>
          s.fields.some((f) => miss.has(f.name)),
        );
        if (firstSection >= 0) setActive(firstSection);
        setSubmitError(
          `This inspection can't be submitted yet — ${e.missing.length} required ${
            e.missing.length === 1 ? "field is" : "fields are"
          } unanswered. They're highlighted below.`,
        );
      } else {
        setSubmitError(
          e instanceof Error ? e.message : "Failed to submit inspection.",
        );
      }
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

  const section = SECTIONS[active];

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

      <ProgressIndicator
        sections={SECTIONS}
        activeIndex={active}
        statuses={sectionStatuses}
        onSelect={setActive}
      />

      {submitError && (
        <p
          role="alert"
          className="rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-300"
        >
          {submitError}
        </p>
      )}

      <FormSection
        title={section.title}
        index={active}
        total={SECTIONS.length}
        saveState={saveState(active)}
        saveError={phases[active].error}
        savedAt={phases[active].savedAt}
        onSave={() => void saveSection(active)}
      >
        {section.fields.map((def) => (
          <Field
            key={def.name}
            def={def}
            value={values[def.name] ?? null}
            invalid={missing.has(def.name)}
            onChange={(v) => setField(def.name, v)}
          />
        ))}
      </FormSection>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setActive((a) => Math.max(0, a - 1))}
          disabled={active === 0}
          className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:invisible"
        >
          ← Previous
        </button>
        {active < SECTIONS.length - 1 ? (
          <button
            type="button"
            onClick={() => setActive((a) => Math.min(SECTIONS.length - 1, a + 1))}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
          >
            Next →
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="rounded-md bg-white p-6 shadow-sm ring-1 ring-gray-300">
        <p className="text-sm text-gray-600">
          Submit when the 8 required fields (marked{" "}
          <span className="font-medium text-red-600">*</span>) are answered.
          Saved sections are kept even if you submit later.
        </p>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="mt-4 rounded-md bg-blue-700 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit inspection"}
        </button>
      </div>
    </section>
  );
}

// ─── One labelled field ────────────────────────────────────────────────────

interface FieldProps {
  def: FieldDef;
  value: FormValue;
  invalid: boolean;
  onChange: (value: FormValue) => void;
}

const CONTROL_CLASS =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base shadow-sm focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700";

function Field({ def, value, invalid, onChange }: FieldProps) {
  const id = `field-${def.name}`;
  const describedBy = invalid ? `${id}-error` : undefined;
  const controlClass = `${CONTROL_CLASS}${invalid ? " border-red-600 ring-1 ring-red-600" : ""}`;

  let control: React.ReactNode;
  if (def.type === "bool") {
    control = (
      <select
        id={id}
        value={value === true ? "true" : value === false ? "false" : ""}
        aria-required={def.required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) =>
          onChange(
            e.target.value === ""
              ? null
              : e.target.value === "true",
          )
        }
        className={controlClass}
      >
        <option value="">— Not answered —</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  } else if (def.type === "int") {
    control = (
      <input
        id={id}
        type="number"
        min={0}
        step={1}
        value={value === null || value === undefined ? "" : String(value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
        className={controlClass}
      />
    );
  } else if (def.type === "text") {
    const common = {
      id,
      value: typeof value === "string" ? value : "",
      "aria-invalid": invalid || undefined,
      "aria-describedby": describedBy,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => onChange(e.target.value),
      className: controlClass,
    };
    control = def.multiline ? (
      <textarea {...common} rows={3} />
    ) : (
      <input type="text" {...common} />
    );
  } else {
    control = (
      <select
        id={id}
        value={typeof value === "string" ? value : ""}
        aria-required={def.required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className={controlClass}
      >
        <option value="">— Not answered —</option>
        {ENUM_OPTIONS[def.type].map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-900">
        {def.label}
        {def.required && (
          <span className="text-red-600" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {control}
      {invalid && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
          Required to submit — please answer this field.
        </p>
      )}
    </div>
  );
}
