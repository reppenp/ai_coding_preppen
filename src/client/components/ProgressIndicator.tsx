import { CheckCircleIcon } from "@heroicons/react/24/solid";

// The inspection form's hardest UI problem (DESIGN.md §7): keep John oriented
// across a long 4-section form. This is a stepped progress rail — he always
// sees where he is, which sections are done, and can jump between them.
//
// "Complete" = every required-to-submit field in that section is answered
// (computed by InspectionForm; this component is presentational). a11y floor
// §5: state is conveyed by text + icon, never colour alone.

export type SectionStatus = "complete" | "incomplete";

interface ProgressIndicatorProps {
  sections: { title: string }[];
  activeIndex: number;
  statuses: SectionStatus[];
  onSelect: (index: number) => void;
}

export function ProgressIndicator({
  sections,
  activeIndex,
  statuses,
  onSelect,
}: ProgressIndicatorProps) {
  return (
    <nav aria-label="Inspection sections">
      <ol className="flex flex-col gap-1 sm:flex-row sm:gap-2">
        {sections.map((section, i) => {
          const isActive = i === activeIndex;
          const isComplete = statuses[i] === "complete";
          return (
            <li key={section.title} className="flex-1">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={isActive ? "step" : undefined}
                className={[
                  "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700",
                  isActive
                    ? "border-blue-700 bg-blue-50"
                    : "border-gray-300 bg-white hover:bg-gray-50",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    isComplete
                      ? "bg-green-600 text-white"
                      : isActive
                        ? "bg-blue-700 text-white"
                        : "bg-gray-100 text-gray-600",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {isComplete ? (
                    <CheckCircleIcon className="h-5 w-5" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900">
                    {section.title}
                  </span>
                  <span
                    className={[
                      "block text-xs",
                      isComplete ? "text-green-600" : "text-gray-600",
                    ].join(" ")}
                  >
                    {isComplete ? "Complete" : "In progress"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
