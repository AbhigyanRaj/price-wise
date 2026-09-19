import { QueryProvider } from "./providers";
import { AuthProvider } from "@/features/auth/useAuth";
import { AppRouter } from "./router";

export function App() {
  return (
    <QueryProvider>
      {/* Auth sits inside the query provider because the session is itself a
          query, which keeps it cached, refetchable and invalidatable like any
          other server state. */}
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </QueryProvider>
  );
}
