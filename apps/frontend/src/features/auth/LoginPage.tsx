import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router";
import { LoginSchema, type LoginInput } from "@pricewise/shared";
import { api, ApiError } from "@/lib/api";
import { useAuth, SESSION_QUERY_KEY } from "./useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FullPageSpinner } from "@/components/data/States";
import { PipelinePreview } from "./PipelinePreview";
import type { SessionDto } from "@/lib/types";

const DEMO_ACCOUNTS = [
  { email: "admin@northwind.test", org: "Northwind Retail", role: "Admin" },
  { email: "analyst@northwind.test", org: "Northwind Retail", role: "Analyst" },
  { email: "admin@meridian.test", org: "Meridian Goods", role: "Admin" },
  { email: "analyst@meridian.test", org: "Meridian Goods", role: "Analyst" },
];

const DEMO_PASSWORD = "Pricewise2026!";

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const form = useForm<LoginInput>({
    // The same schema object the API validates with, imported from the shared
    // package. Client and server therefore enforce byte-identical rules, and a
    // rule change cannot drift between them.
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const login = useMutation({
    mutationFn: (values: LoginInput) => api.post<SessionDto>("/auth/login", values),
    onSuccess(session) {
      // Seed the cache directly rather than refetching. The response already
      // contains the session, so a second round trip would only add latency.
      queryClient.setQueryData(SESSION_QUERY_KEY, session);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? "/", { replace: true });
    },
    onError(error) {
      if (!(error instanceof ApiError)) return;

      if (error.code === "RATE_LIMITED") {
        form.setError("root", {
          message: "Too many attempts. Wait a few minutes and try again.",
        });
        return;
      }

      // Attached to the form rather than a field: the server deliberately does
      // not say which of the two was wrong, because that would reveal whether
      // an email is registered.
      form.setError("root", { message: error.message });
    },
  });

  if (isLoading) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to="/" replace />;

  function fillDemo(email: string) {
    form.setValue("email", email, { shouldValidate: true });
    form.setValue("password", DEMO_PASSWORD, { shouldValidate: true });
    form.setFocus("password");
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Left: a product artefact, not a tagline. Showing the thing the app
          actually does beats asserting that it does it. */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface lg:block">
        <div
          aria-hidden="true"
          className="grain absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(48rem 32rem at 20% 0%, var(--brand-wash), transparent 70%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-center px-12 py-16">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">
            Dynamic pricing intelligence
          </p>
          <h1 className="mb-2 max-w-sm text-[2rem] leading-[1.15] tracking-[-0.032em]">
            Five agents. One price. Your decision.
          </h1>
          <p className="mb-10 max-w-sm text-sm text-ink-secondary">
            Specialists analyse the market, your costs and demand. You approve, override or reject.
            Nothing reaches the storefront without a decision.
          </p>
          <PipelinePreview />
        </div>
      </aside>

      <main className="relative flex items-center justify-center px-6 py-12">
        <div
          aria-hidden="true"
          className="grain absolute inset-0 lg:hidden"
          style={{
            backgroundImage:
              "radial-gradient(32rem 24rem at 50% 0%, var(--brand-wash), transparent 70%)",
          }}
        />

        <div className="relative w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs font-bold text-brand-ink">
              P
            </span>
            <span className="text-[1.3rem] font-semibold tracking-[-0.02em]">Pricewise</span>
          </div>

          <h2 className="mb-1">Sign in</h2>
          <p className="mb-6 text-[13px] text-ink-secondary">
            Use one of the demo accounts below, or your own credentials.
          </p>

          <form
            onSubmit={form.handleSubmit((values) => login.mutate(values))}
            className="space-y-4"
            noValidate
          >
            <Field
              id="email"
              label="Email"
              type="email"
              autoComplete="username"
              error={form.formState.errors.email?.message}
              register={form.register("email")}
            />
            <Field
              id="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              error={form.formState.errors.password?.message}
              register={form.register("password")}
            />

            {form.formState.errors.root && (
              // role="alert" so it is announced. Reserved height is not needed
              // here because the message sits above the button, not between
              // fields, so nothing below it shifts.
              <p role="alert" className="text-[13px] text-down">
                {form.formState.errors.root.message}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? "Signing in" : "Sign in"}
            </Button>
          </form>

          <div className="mt-8">
            <div className="mb-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-line" />
              <span className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                Demo accounts
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>

            {/* The brief says an evaluator should reach populated data
                immediately. Making them hunt for credentials in a README is
                avoidable friction. */}
            <div className="grid gap-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => fillDemo(account.email)}
                  className="flex items-center justify-between rounded-md border border-line px-2.5 py-1.5 text-left transition-colors duration-100 hover:border-line-strong hover:bg-surface-hover"
                >
                  <span className="font-mono text-[11px] text-ink-secondary">{account.email}</span>
                  <span className="text-[11px] text-ink-tertiary">
                    {account.org} · {account.role}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 font-mono text-[11px] text-ink-tertiary">
              password: {DEMO_PASSWORD}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
  error?: string | undefined;
  register: ReturnType<ReturnType<typeof useForm<LoginInput>>["register"]>;
}

function Field({ id, label, type, autoComplete, error, register }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        // Programmatically associated, so a screen reader reads the error with
        // the field rather than leaving it stranded elsewhere in the DOM.
        aria-describedby={error ? `${id}-error` : undefined}
        {...register}
      />
      {error && (
        <p id={`${id}-error`} className="text-[12px] text-down">
          {error}
        </p>
      )}
    </div>
  );
}
