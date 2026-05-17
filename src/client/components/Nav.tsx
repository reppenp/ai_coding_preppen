import { NavLink } from "react-router-dom";

// Top nav, desktop-first (DESIGN.md §2): app name left, primary-section tabs.
// No hamburger, no sidebar (anti-reference: not Jira). Active tab and focus
// are both visible (a11y floor §5 — focus never removed without replacement).

const tabs = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/orders/new", label: "New Order", end: false },
  { to: "/review", label: "Review Queue", end: false },
];

export function Nav() {
  return (
    <header className="border-b border-gray-300 bg-white shadow-sm">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl items-center gap-8 px-6"
      >
        <span className="py-4 text-lg font-semibold text-gray-900">
          Inspection Workflow
        </span>
        <ul className="flex gap-1">
          {tabs.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  [
                    "inline-block rounded-md px-3 py-2 text-sm font-medium",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700",
                    isActive
                      ? "bg-blue-700 text-white"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  ].join(" ")
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
