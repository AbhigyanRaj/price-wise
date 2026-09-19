import { createBrowserRouter, RouterProvider } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { LoginPage } from "@/features/auth/LoginPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { CatalogPage } from "@/features/products/CatalogPage";
import { ProductDetailPage } from "@/features/products/ProductDetailPage";
import { QueuePage } from "@/features/recommendations/QueuePage";
import { RecommendationDetailPage } from "@/features/recommendations/RecommendationDetailPage";
import { AuditPage } from "@/features/audit/AuditPage";
import { SettingsPage } from "@/features/org/SettingsPage";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "products", element: <CatalogPage /> },
      { path: "products/:productId", element: <ProductDetailPage /> },
      { path: "recommendations", element: <QueuePage /> },
      { path: "recommendations/:recommendationId", element: <RecommendationDetailPage /> },
      { path: "audit", element: <AuditPage /> },
      {
        path: "settings",
        // Gated here as well as in the sidebar, so typing the URL directly
        // lands on a forbidden page rather than a broken screen.
        element: (
          <RequireAuth adminOnly>
            <SettingsPage />
          </RequireAuth>
        ),
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
