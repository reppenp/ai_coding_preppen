// Single source of truth for the inspection form's field list, mirroring
// PRD §5 / src/routes/forms.ts FIELDS / migration 0003 exactly. Both the
// editable form (Phase 2 — InspectionForm.tsx) and the read-only review
// (Phase 4 — ReviewDetail.tsx) import from here so the two views can never
// drift from each other. Adding a field is a single-file edit on this side.

import type { FormValue, FormValues } from "./api";

export type FieldType = "cond" | "occupancy" | "traffic" | "bool" | "int" | "text";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  /** One of the 8 required-to-submit fields (PRD §5). UI-only marker — D1 stays
   *  nullable so per-section saves in poor connectivity never fail. */
  required?: boolean;
  /** text only — render as <textarea> in the editor / pre-wrap in the report. */
  multiline?: boolean;
}

export interface SectionDef {
  title: string;
  fields: FieldDef[];
}

export const SECTIONS: SectionDef[] = [
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

export const ALL_FIELDS: FieldDef[] = SECTIONS.flatMap((s) => s.fields);

export const ENUM_OPTIONS: Record<"cond" | "occupancy" | "traffic", string[]> = {
  cond: ["Good", "Fair", "Poor", "N-A"],
  occupancy: ["Owner-occupied", "Leased", "Multi-tenant"],
  traffic: ["Low", "Medium", "High"],
};

/** API returns booleans as 0/1 integers; everything else as-is. Normalise into
 *  the shape the editable controls bind to (true/false/null for bools, raw
 *  strings/numbers/null otherwise). Used by both InspectionForm (to populate
 *  controls) and ReviewDetail (to format values for display). */
export function normalizeLoaded(form: FormValues): FormValues {
  const out: FormValues = {};
  for (const def of ALL_FIELDS) {
    const v = form[def.name];
    if (def.type === "bool") {
      out[def.name] =
        v === 1 || v === true ? true : v === 0 || v === false ? false : null;
    } else {
      out[def.name] = v ?? null;
    }
  }
  return out;
}

/** Render one normalised answer as the read-only string the report shows.
 *  Returns "—" when the field is unanswered (null) so blank cells don't look
 *  like a layout bug. */
export function formatValue(def: FieldDef, value: FormValue): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (def.type) {
    case "bool":
      return value === true ? "Yes" : value === false ? "No" : "—";
    case "int":
      return String(value);
    default:
      return String(value);
  }
}
