import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
} from "react-router-dom";
import { Nav } from "./components/Nav";
import { Dashboard } from "./pages/Dashboard";
import { NewOrder } from "./pages/NewOrder";
import "./index.css";

// Routes mirror DESIGN.md §2's IA exactly. /orders/:id (Phase 2) and /review
// (Phase 4) are placeholders so the nav + router are complete now and those
// phases only swap the element, not the routing.
function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="rounded-md bg-white p-8 text-gray-600 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
      <p className="mt-2">This screen ships in a later phase.</p>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "orders/new", element: <NewOrder /> },
      {
        path: "orders/:id",
        element: <ComingSoon title="Inspection Form" />,
      },
      { path: "review", element: <ComingSoon title="Review Queue" /> },
      { path: "*", element: <ComingSoon title="Page not found" /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
