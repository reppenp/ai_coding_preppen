import { useEffect, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { listOrders, type Order } from "../api";
import { StatusBadge } from "../components/StatusBadge";

// The hero screen (DESIGN.md §2): in 3 seconds, "here are all inspections and
// where they stand." Data-dense table, shared by all three users.

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

/** Cycle time in whole days (created → decided). Blank until Phase 4 fills
 *  decided_at — the column exists now so the layout doesn't shift later. */
function cycleTime(o: Order): string {
  if (!o.decided_at) return "—";
  const ms =
    new Date(o.decided_at.replace(" ", "T") + "Z").getTime() -
    new Date(o.created_at.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(ms)) return "—";
  return `${Math.max(0, Math.round(ms / 86_400_000))} d`;
}

const col = createColumnHelper<Order>();
const columns = [
  col.accessor("insured_name", {
    header: "Insured",
    // The insured name is the row's entry point into its inspection form
    // (Phase 2, /orders/:id). A real <Link> — keyboard-focusable with a
    // visible focus ring (a11y floor §5), not a row onClick.
    cell: (c) => (
      <Link
        to={`/orders/${c.row.original.id}`}
        className="font-medium text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
      >
        {c.getValue()}
      </Link>
    ),
  }),
  col.accessor("property_address", { header: "Property" }),
  col.accessor("status", {
    header: "Status",
    cell: (c) => <StatusBadge status={c.getValue()} />,
  }),
  col.accessor("created_at", {
    header: "Created",
    cell: (c) => formatDate(c.getValue()),
  }),
  col.display({
    id: "cycle_time",
    header: "Cycle time",
    cell: (c) => cycleTime(c.row.original),
  }),
];

export function Dashboard() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listOrders()
      .then(setOrders)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load orders"),
      );
  }, []);

  const table = useReactTable({
    data: orders ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <section>
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">
        Inspection Orders
      </h1>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-300"
        >
          {error}
        </p>
      )}

      {!error && orders === null && (
        <p className="text-gray-600">Loading orders…</p>
      )}

      {!error && orders !== null && orders.length === 0 && (
        <div className="rounded-md bg-white p-8 text-center text-gray-600 shadow-sm">
          No inspection orders yet. Create one from{" "}
          <span className="font-medium text-gray-900">New Order</span>.
        </div>
      )}

      {!error && orders !== null && orders.length > 0 && (
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
