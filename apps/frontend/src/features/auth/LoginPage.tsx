import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { AlertTriangle, Loader2 } from "lucide-react";
import { LoginSchema, type LoginInput } from "@pricewise/shared";
import { ApiError } from "@/lib/api";
import { useAuth } from "./useAuth";
import { useLogin } from "./api";
import { Field } from "@/components/form/Field";
import { FullPageSpinner } from "@/components/data/States";
import { AuthLayout, AUTH_FIELD, AUTH_INPUT, AUTH_LINK, AUTH_SUBMIT } from "./AuthLayout";

/**
 * Sign in.
 *
 * The seeded demo accounts deliberately do NOT appear here. This is the
 * product's front door and a credential list on it reads as a test harness.
 * The four accounts and their shared password are documented in README.md,
 * which is where a reviewer is already looking.
 */
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

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use your work email."
      footer={
        <>
          <p>
            New here?{" "}
            <Link to="/signup" className={AUTH_LINK}>
              Create a workspace
            </Link>
          </p>
          <p className="mt-1">
            Have an invite code?{" "}
            <Link to="/join" className={AUTH_LINK}>
              Join one
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
          placeholder="you@company.com"
          className={AUTH_FIELD}
          inputClassName={AUTH_INPUT}
          error={form.formState.errors.email?.message}
          register={form.register("email")}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          reveal
          className={AUTH_FIELD}
          inputClassName={AUTH_INPUT}
          error={form.formState.errors.password?.message}
          register={form.register("password")}
        />

        {/* Inline and above the button. Tinted at 5% with a 30% border: loud
            enough to find, quiet enough not to look like the page crashed. */}
        {form.formState.errors.root && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-neg/30 bg-neg/5 p-2.5 text-[12px] text-neg"
          >
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{form.formState.errors.root.message}</span>
          </div>
        )}

        {/* The spinner replaces the label and keeps the button the same
            height, so nothing shifts while it works. */}
        <button
          type="submit"
          className={AUTH_SUBMIT}
          disabled={login.isPending}
          aria-busy={login.isPending}
        >
          {login.isPending ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Signing in
            </span>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
