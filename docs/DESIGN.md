# Design Brief

_This file is the source of truth for UI/UX decisions on this project. Fill it out with the `design-brief` skill after the PRD is solid. Keep it short — a design brief is a compass, not a spec._

## 1. Visual identity

**Mood (3–5 adjectives):** Calm, professional, clean.

**Reference apps:** Guidewire Insurance Suite — borrowing the muted blue/gray color palette, data-dense table layouts, top nav + sub-nav structure, and sectioned form patterns with clear field labels.

**Anti-references:** Not Jira — no cluttered sidebars, no nested navigation, no visual noise. Clear hierarchy and obvious wayfinding at all times.

**Brand constraints:** None. Fresh project, full creative freedom.

## 2. Information architecture

**Primary screens (top-level routes):**
- `/` — Dashboard: shared status view of all inspection orders
- `/orders/new` — New Order: Jeff creates an inspection order
- `/orders/:id` — Inspection Form: John completes a field inspection
- `/review` — Review Queue: Kelly works through submitted inspections

**Navigation model:** Top nav with app name on the left and tabs for primary sections (Dashboard, Orders, Review Queue). Desktop-first; no hamburger menu. Mobile nav collapses if mobile support is added in a future version.

**The hero screen:** The Dashboard. In 3 seconds it should communicate: "here are all your inspections and where they stand." It's the shared view all three users rely on to understand workflow status.

## 3. Component approach

- **Framework:** React.
- **Component library:** [Headless UI](https://headlessui.com/) for unstyled, accessible primitives (Dialog, Menu, Combobox, Listbox, Disclosure, Tabs, etc.).
- **Styling:** Tailwind CSS unless a strong reason to deviate.
- **Icons:** Heroicons.
- **Custom components:**
  - Data table (Dashboard + Review Queue) — sortable/filterable; build with TanStack Table.
  - File uploader (photo attachments per inspection section) — build from scratch using a drag-and-drop input pattern.

**Why this stack:** Headless UI gives accessibility (focus management, ARIA, keyboard nav) for free; Tailwind makes the styling decisions explicit in markup. Together they let an AI-assisted developer move fast without shipping inaccessible junk.

## 4. Visual tokens

Pick a small palette and stick to it. Don't try to design a full design system — pick enough to be consistent.

- **Color:**
  - Primary: `blue-700` (#1d4ed8)
  - Neutral scale: `gray-50` / `gray-100` / `gray-300` / `gray-600` / `gray-900`
  - Accent: `blue-700` (same as primary for this app's scope)
  - Semantic: `green-600` (success), `yellow-500` (warning), `red-600` (danger)
- **Type:** System stack throughout (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`). One font, used for both body and headings. Sizes: `text-sm` (small/labels), `text-base` (body), `text-lg` (h3), `text-xl` (h2), `text-2xl` (h1).
- **Spacing scale:** Tailwind defaults.
- **Radius:** `rounded-md` applied consistently across all components.
- **Shadow:** `shadow-sm` for cards and table containers; `shadow-md` for modals and dropdowns. Nothing heavier.

## 5. Accessibility floor

The non-negotiables for this project:

- Keyboard navigable end-to-end.
- WCAG AA contrast on all text.
- Visible labels on all form inputs (no placeholder-as-label).
- Visible focus states — never `outline: none` without a visible replacement.
- Color is never the only way to convey information — status badges use both text and color.

## 6. Responsive strategy

- **Breakpoints:** Desktop-only for v1. No responsive breakpoints required.
- **Smallest target:** Desktop/laptop browser (1280px+ assumed). Not tested or designed for tablet or phone.
- **Mobile:** Deferred to a future version. If John's mobile use case is promoted from stretch goal, add responsive rules then — likely nav collapses to hamburger, inspection form reflows to single column, tables become cards.

## 7. Risks & unknowns

- **Inspection form length (High):** The form has 4 sections and many fields. Keeping John oriented without the form feeling overwhelming is the hardest UI problem. Consider a stepped/tabbed section layout with a progress indicator so he always knows where he is and what's left.

## 8. Out of scope (for v1)

- Dark mode
- Animations beyond default Headless UI transitions
- Custom illustrations or iconography beyond Heroicons
- Responsive/mobile layout (deferred — see section 6)
