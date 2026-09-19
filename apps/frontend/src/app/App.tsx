import { QueryProvider } from "./providers";
import { AuthProvider } from "@/features/auth/useAuth";
import { ToastProvider } from "@/components/ui/toast";
import { AppRouter } from "./router";

export function App() {
  return (
    <QueryProvider>
      {/* Auth sits inside the query provider because the session is itself a
          query, which keeps it cached, refetchable and invalidatable like any
          other server state. */}
      <AuthProvider>
        {/* Above the router: a toast outlives the screen that raised it, which
            is the point. Resolving a decision navigates to the next one, and
            the Undo for the last one has to survive that navigation. */}
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
