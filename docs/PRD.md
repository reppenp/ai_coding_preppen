# Product Requirements Document (PRD)

> **Status:** Draft
> **Last updated:** 2026-05-12
> **Author:** reppenp
> **Stakeholder:** Internal — Commercial Lines Insurance Operations

---

## 1. The problem

Our company manages commercial property insurance inspections using a legacy system built on outdated, unsupported technology that no one on staff knows how to maintain. The system forces inspectors to return to the office to submit reports because there is no browser-based or mobile field submission. It also lacks end-to-end workflow tracking — there is no reliable way to know where any given inspection is in the process, from order creation through underwriter review. As a result, we have no visibility into inspection cycle time (how long it takes from order creation to a final underwriting decision), which means we cannot identify bottlenecks or measure operational performance.

---

## 2. The users

Three internal users. No external (property owner) access in v1.

### Jeff — Admin / Operations
- **Role:** Identifies properties that need inspections by running reports from the Policy system (new policies, renewals, policy changes) and the Claims system (new claims flagged for inspection). Creates inspection orders manually and monitors overall workflow status.
- **Current workflow:** Runs reports from Policy and Claims systems, manually tracks inspection status.
- **Technical comfort:** Internal business user, comfortable with web applications.
- **Device:** Desktop/laptop, office and remote.

### John — Inspector
- **Role:** Conducts on-site inspections of commercial properties. Currently limited to using the legacy system from the office. Wants to submit reports from his laptop in the field, and eventually from his phone.
- **Current workflow:** Inspects property, takes notes and photos, returns to office to enter report into legacy system.
- **Technical comfort:** Comfortable with web applications; wants mobile capability.
- **Device:** Laptop in the field (v1). Mobile phone (stretch goal).
- **Volume:** ~5 inspections/week normal; up to 5/day during catastrophe events (hail, hurricane, etc.).

### Kelly — Underwriter
- **Role:** Reviews completed inspection reports to make coverage and premium decisions. Works from a queue of submitted inspections.
- **Current workflow:** Receives inspection reports through the legacy system, reviews findings, records decisions.
- **Technical comfort:** Internal business user, comfortable with web applications.
- **Device:** Desktop/laptop.

---

## 3. What success looks like

- **Primary metric:** Inspection close rate — the elapsed time from inspection order creation to underwriter decision recorded in the system. Baseline to be established in the first 90 days post-launch; improvement target set from there.
- **Must-have outcome:** All three users can complete their part of the inspection workflow entirely within the new system, from order creation (Jeff) through field submission (John) through underwriting decision (Kelly), with cycle time visible to all.
- **Nice-to-have outcome:** John can submit reports and photos from his mobile phone in the field.
- **Not a goal:** Property owner portal, external notifications (text/email), integration with Policy or Claims systems, compliance/audit data retention.

---

## 4. Core user stories

1. **[Must]** As Jeff (Admin), I want to create an inspection order with insured details, property information (address, property use), and contact information for scheduling so that inspections can be initiated and tracked from the start.

2. **[Must]** As John (Inspector), I want to open an assigned inspection order and complete a structured form in my browser covering Structure & Maintenance, Safety & Risk Management, Occupancy & Usage, and Liability Exposures so that I can capture all required inspection data without returning to the office.

3. **[Must]** As Kelly (Underwriter), I want a queue of submitted inspection reports where I can add notes and recommendations, record a premium adjustment direction (increase / decrease / no change), and indicate a policy action (approve / cancel / renew) so that underwriting decisions are captured in the system.

4. **[Must]** As Jeff (Admin), I want to see the cycle time for every inspection order (date created → date underwriter decision recorded) so that I can identify bottlenecks and measure operational performance.

5. **[Must]** As any user (Jeff, John, or Kelly), I want to see the status of all inspection orders in the system so that I can understand what is pending, in progress, and complete.

6. **[Should]** As John (Inspector), I want to attach photos to each section of the inspection form so that underwriters have visual evidence supporting the written findings.

7. **[Could — stretch]** As John (Inspector), I want to submit inspection reports and photos from my mobile phone so that I am not limited to my laptop in the field.

8. **[Won't — v1]** As Jeff (Admin), I want to import a CSV of policy numbers requiring inspections so that I don't have to enter orders manually. *(v2)*

9. **[Won't — v1]** As any user, I want to receive text or email alerts when inspection status changes. *(v2)*

---

## 5. Inspection form structure

The inspection form (Story 2) covers four sections, identical for all commercial property types in v1:

### Section 1 — Building Structure & Maintenance
- Roof condition, age, and materials
- Exterior walls, foundations, and windows
- HVAC systems, plumbing, and electrical infrastructure

### Section 2 — Safety & Risk Management
- Fire exits, signage, and accessibility
- Security systems (cameras, lighting, alarms)
- Storage practices, especially for hazardous materials
- Slip, trip, and fall prevention measures
- Presence of fire suppression or containment systems (kitchens, mechanical rooms)

### Section 3 — Occupancy & Usage
- Type of businesses or tenants operating on-site
- Whether the building is owner-occupied, leased, or multi-tenant
- Volume of foot traffic or customer activity
- Use of high-risk equipment or processes (welding, cooking, manufacturing)

### Section 4 — Liability Exposures
- Parking lot and sidewalk conditions
- ADA compliance
- Safety protocols for public-facing areas
- Tenant or employee safety training programs

---

## 6. Out of scope (v1)

- Property owner access or portal
- Text and email notifications/alerts
- CSV import from Policy or Claims systems
- Authentication and role-based access control *(planned for v2 before any production use with real policy data)*
- Compliance or audit-grade data retention
- Reporting or analytics beyond cycle time tracking
- Mobile submission (stretch goal only — not committed)

---

## 7. Technical shape

- **Type of app:** Full-stack web application, accessible from any internet connection (not intranet-only).
- **Does it need to store data?** Yes — structured records (orders, form responses, underwriter decisions) and files (photos). Purely operational; no long-term retention requirements.
- **Does it need authentication?** No — v1 is open access. **Note: must add auth before any production use with real policyholder data.**
- **Does it call external services?** No external integrations in v1.
- **Draft/save behavior:** The inspection form must save progress mid-inspection. John may lose connectivity in the field; the system must not lose partially completed work.
- **Photo handling:** No limit on number of photos per inspection. Photos are uploaded per section, not batched at submit.

### Proposed Cloudflare stack

| Need | CF Product | Why |
|---|---|---|
| Hosting the web UI | Cloudflare Pages | Hosts the frontend globally; zero config deployment |
| Backend logic & API | Cloudflare Workers | Serverless backend handles form submissions, workflow state, and order management |
| Structured data (orders, form data, decisions) | Cloudflare D1 | SQL database — right fit for relational inspection workflow records |
| Photo storage | Cloudflare R2 | Object storage for uploaded images; no egress fees |

---

## 8. Risks and unknowns

1. **Draft saving + photo uploads in poor connectivity (High):** John inspects properties where signal may be weak or absent. The form must save state incrementally to D1 as he works, and photos must upload to R2 individually rather than all at once. This is the hardest technical problem in the build — design it explicitly before coding.

2. **No authentication = no role separation (High):** Jeff, John, and Kelly can all see and edit everything. Acceptable for a controlled v1 pilot, but this must be addressed before the system handles real policy data at scale. Plan auth for v2.

3. **Catastrophe volume spikes (Medium):** John's volume can jump from 5/week to 5/day during a major event. The system should handle this gracefully, but load testing should be considered before any catastrophe-season launch.

4. **Form completeness and validation (Low):** What fields are required vs. optional on the inspection form? An incomplete submission could create downstream problems for Kelly. Define required fields before building the form.

---

## 9. Milestones

- **Week 1 end:** D1 schema defined and migrated. Workers API running. Jeff can create an inspection order and see it in the shared status dashboard.
- **Week 2 end:** John can open an assigned order, complete all four sections of the inspection form in a browser, save progress mid-inspection, and submit. Order status updates to "Submitted."
- **Week 3 end:** Kelly has a review queue of submitted inspections, can add notes and record a premium/policy decision. Cycle time (order created → decision recorded) is visible to all three users.
