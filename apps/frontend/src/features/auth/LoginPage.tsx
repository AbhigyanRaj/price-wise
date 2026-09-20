import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { LoginSchema, type LoginInput } from "@pricewise/shared";
import { ApiError } from "@/lib/api";
import { useAuth } from "./useAuth";
import { useLogin } from "./api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/form/Field";
import { FullPageSpinner } from "@/components/data/States";
import { AuthLayout } from "./AuthLayout";

const DEMO_ACCOUNTS = [
  { email: "admin@northwind.test", org: "Northwind Retail", role: "Admin" },
  { email: "analyst@northwind.test", org: "Northwind Retail", role: "Analyst" },
  { email: "admin@meridian.test", org: "Meridian Goods", role: "Admin" },
  { email: "analyst@meridian.test", org: "Meridian Goods", role: "Analyst" },
];

const DEMO_PASSWORD = "Pricewise2026!";

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const form = useForm<LoginInput>({
    // The same schema object the API validates with, imported from the shared
    // package. Client and server therefore enforce byte-identical rules, and a
    // rule change cannot drift between them.
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const login = useLogin();

  const handlers = {
    onSuccess() {
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? "/", { replace: true });
    },
    onError(error: unknown) {
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
  };

  if (isLoading) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to="/" replace />;

  function fillDemo(email: string) {
    form.setValue("email", email, { shouldValidate: true });
    form.setValue("password", DEMO_PASSWORD, { shouldValidate: true });
    form.setFocus("password");
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use one of the demo accounts below, or your own credentials."
      footer={
        <>
          <p>
            No workspace yet?{" "}
            <Link to="/signup" className="text-acc-t2 underline-offset-2 hover:underline">
              Create one
            </Link>
          </p>
          <p className="mt-1">
            Have an invite code?{" "}
            <Link to="/join" className="text-acc-t2 underline-offset-2 hover:underline">
              Join a workspace
            </Link>
          </p>
        </>
      }
    >
      <form
        onSubmit={form.handleSubmit((values) => login.mutate(values, handlers))}
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
          <p role="alert" className="text-[13px] text-neg">
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
          <span className="text-[11px] uppercase tracking-widest text-t4">Demo accounts</span>
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
              className="flex items-center justify-between rounded-md border border-line px-2.5 py-1.5 text-left transition-colors duration-100 hover:border-line3 hover:bg-hover"
            >
              <span className="font-mono text-[11px] text-t3">{account.email}</span>
              <span className="text-[11px] text-t4">
                {account.org} · {account.role}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 font-mono text-[11px] text-t4">password: {DEMO_PASSWORD}</p>
      </div>
    </AuthLayout>
  );
}
