import { Navigate, useLocation } from "react-router";
import { useAuth } from "@/features/auth/useAuth";
import { ErrorState, FullPageSpinner } from "@/components/data/States";

/**
 * Gates a route on being signed in, and optionally on being an admin.
 *
 * Purely a UX affordance. Every protected endpoint enforces the same rules
 * server side, so a user who edits their way past this gets a 401 or a 403
 * from the API rather than data they should not see.
 */
export function RequireAuth({
  adminOnly = false,
  children,
}: {
  adminOnly?: boolean | undefined;
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, isAdmin, error, refetch } = useAuth();
  const location = useLocation();

  // Waiting on /auth/me. Redirecting now would bounce a signed-in user to the
  // login page on every hard refresh.
  if (isLoading) return <FullPageSpinner />;

  // The identity check failed for a reason other than "not signed in", so we
  // do not know whether this session is valid. Bouncing to the login page here
  // would throw out a user who is still signed in, which is what a rate-limited
  // or briefly unreachable API used to do.
  if (error) {
    return (
      <ErrorState
        title="Could not confirm your session"
        description={`${error.message} You are probably still signed in. Try again in a moment.`}
        onRetry={refetch}
        className="min-h-[60vh]"
      />
    );
  }

  if (!isAuthenticated) {
    // Remember where they were headed so login can return them there.
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (adminOnly && !isAdmin) return <Forbidden />;

  return <>{children}</>;
}

function Forbidden() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="mb-2">Not available to your role</h1>
        <p className="text-sm text-t3">
          Organization settings are restricted to admins. Ask an admin in your organization if you
          need a threshold or margin floor changed.
        </p>
      </div>
    </div>
  );
}
