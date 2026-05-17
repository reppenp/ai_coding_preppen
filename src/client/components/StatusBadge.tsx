import type { OrderStatus } from "../api";

// a11y floor §5: color is never the only signal — every badge shows the
// status TEXT as well as color. Colors come from DESIGN.md §4's semantic set.
const STYLES: Record<OrderStatus, string> = {
  Ordered: "bg-gray-100 text-gray-800 ring-gray-300",
  "In Progress": "bg-yellow-100 text-yellow-800 ring-yellow-300",
  Submitted: "bg-blue-100 text-blue-800 ring-blue-300",
  Reviewed: "bg-green-100 text-green-800 ring-green-300",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-sm font-medium ring-1 ring-inset ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
