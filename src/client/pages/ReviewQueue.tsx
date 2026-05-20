import { useEffect, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { listOrders, type Order } from "../api";

// Phase 4 — Story 3: Kelly's queue of inspections waiting to be decided.
//
// The queue shows only orders with status 'Submitted'. Reviewed orders are
// still visible on the shared Dashboard (PRD §4 story 5) but aren't part of
// Kelly's "to-do" list, so they're filtered out here. Same TanStack-Table
// layout as Dashboard.tsx — Kelly already knows that table shape.

/** SQLite datetime('now') is "YYYY-MM-DD HH:MM:SS" UTC. Show just the date. */
function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

const col = createColumnHelper<Order>();
const columns = [
  col.accessor("insured_name", {
    header: "Insured",
    // Each row links into the per-inspection review view (Phase 4).
    cell: (c) => (
      <Link
        to={`/review/${c.row.original.id}`}
        className="font-medium text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
      >
        {c.getValue()}
      </Link>
    ),
  }),
  col.accessor("property_address", { header: "Property" }),
  col.accessor("property_use", {
    header: "Use",
    cell: (c) => c.getValue() ?? "—",
  }),
  col.accessor("submitted_at", {
    header: "Submitted",
    cell: (c) => formatDate(c.getValue()),
  }),
];

export function ReviewQueue() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listOrders()
      .then(setOrders)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load queue"),
      );
  }, []);

  const submitted = (orders ?? []).filter((o) => o.status === "Submitted");

  const table = useReactTable({
    data: submitted,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <section>
      <h1 className="mb-2 text-2xl font-semibold text-gray-900">
        Review Queue
      </h1>
      <p className="mb-6 text-sm text-gray-600">
        Submitted inspections waiting for an underwriting decision.
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-300"
        >
          {error}
        </p>
      )}

      {!error && orders === null && (
        <p className="text-gray-600">Loading queue…</p>
      )}

      {!error && orders !== null && submitted.length === 0 && (
        <div className="rounded-md bg-white p-8 text-center text-gray-600 shadow-sm">
          Nothing in the queue right now. New submissions will appear here.
        </div>
      )}

      {!error && submitted.length > 0 && (
        <div className="overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-gray-300">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-50 text-gray-600">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      scope="col"
                      className="px-4 py-3 font-medium"
                    >
                      {flexRender(
                        h.column.columnDef.header,
                        h.getContext(),
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-900">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
