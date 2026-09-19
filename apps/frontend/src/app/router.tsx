import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { RouteError } from "./RouteError";
import { NotFoundPage } from "./NotFoundPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { SignupPage } from "@/features/auth/SignupPage";
import { InviteSignupPage } from "@/features/auth/InviteSignupPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { CatalogPage } from "@/features/products/CatalogPage";
import { ProductDetailPage } from "@/features/products/ProductDetailPage";
import { QueuePage } from "@/features/recommendations/QueuePage";
import { RecommendationDetailPage } from "@/features/recommendations/RecommendationDetailPage";
import { AuditPage } from "@/features/audit/AuditPage";
import { SettingsPage } from "@/features/org/SettingsPage";

/**
 * Exported so tests can mount the real route table under createMemoryRouter
 * rather than asserting against a second, drifting copy of it.
 */
export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage />, errorElement: <RouteError /> },
  { path: "/signup", element: <SignupPage />, errorElement: <RouteError /> },
  { path: "/join", element: <InviteSignupPage />, errorElement: <RouteError /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    // A data router's errorElement already catches render errors anywhere in
    // its subtree, so a separate class ErrorBoundary would be a second
    // mechanism doing the same job with no extra coverage.
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "products", element: <CatalogPage /> },
      { path: "products/:productId", element: <ProductDetailPage /> },
      { path: "decisions", element: <QueuePage /> },
      { path: "decisions/:recommendationId", element: <RecommendationDetailPage /> },
      { path: "activity", element: <AuditPage /> },
      {
        path: "settings",
        // Gated here as well as in the rail, so typing the URL directly lands
        // on a forbidden page rather than a broken screen.
        element: (
          <RequireAuth adminOnly>
            <SettingsPage />
          </RequireAuth>
        ),
      },

      // The screens were renamed with the redesign. Anything already bookmarked
      // or sitting in a browser history still resolves.
      { path: "recommendations", element: <Navigate to="/decisions" replace /> },
      { path: "recommendations/:recommendationId", element: <RedirectDecision /> },
      { path: "audit", element: <Navigate to="/activity" replace /> },

      // Splat as a CHILD of "/", not a top-level route: a signed-in user who
      // mistypes keeps the rail and can navigate out, while a signed-out
      // visitor hits RequireAuth first and is sent to login, so a stranger
      // never learns which routes exist.
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

const router = createBrowserRouter(routes);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

/** Carries the id across the rename instead of dropping the user on the list. */
function RedirectDecision() {
  const id = window.location.pathname.split("/").pop();
  return <Navigate to={`/decisions/${id ?? ""}`} replace />;
}
