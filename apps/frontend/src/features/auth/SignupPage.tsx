import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router";
import { AlertTriangle, Loader2 } from "lucide-react";
import { SignupSchema, type SignupInput } from "@pricewise/shared";
import { Field } from "@/components/form/Field";
import { FullPageSpinner } from "@/components/data/States";
import { applyServerErrors } from "@/lib/formErrors";
import { AuthLayout, AUTH_FIELD, AUTH_INPUT, AUTH_LINK, AUTH_SUBMIT } from "./AuthLayout";
import { useSignup } from "./api";
import { useAuth } from "./useAuth";

/** Stated in full, up front. PasswordSchema carries three separate refinements
 *  and Zod surfaces only the first failure, so a user fixing them one at a
 *  time would pay a round trip per rule. WCAG 3.3.2 wants the requirement
 *  before submission, not after it. */
const PASSWORD_POLICY = "At least 10 characters, with an uppercase letter, a lowercase letter and a digit.";

export function SignupPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const signup = useSignup();
  const navigate = useNavigate();

  const form = useForm<SignupInput>({
    resolver: zodResolver(SignupSchema),
    defaultValues: { name: "", organizationName: "", email: "", password: "" },
  });

  if (isLoading) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <AuthLayout
      title="Create your account"
      subtitle="You will be your workspace's first admin. Invite the rest of the pricing team afterwards."
      footer={
        <>
          <p>
            Already have an account?{" "}
            <Link to="/login" className={AUTH_LINK}>
              Sign in
            </Link>
          </p>
          <p className="mt-1">
            Have an invite code?{" "}
            <Link to="/join" className={AUTH_LINK}>
              Join an existing workspace
            </Link>
          </p>
        </>
      }
    >
      <form
        onSubmit={form.handleSubmit((values) =>
          signup.mutate(values, {
            onSuccess: () => navigate("/", { replace: true }),
            onError: (error) =>
              applyServerErrors(form, error, {
                fallback: "Could not create the account. Please try again.",
                codeToField: { EMAIL_IN_USE: "email", CONFLICT: "email" },
              }),
          }),
        )}
        className="space-y-4"
        noValidate
      >
        <Field
          id="name"
          label="Your name"
          type="text"
          autoComplete="name"
          className={AUTH_FIELD}
          inputClassName={AUTH_INPUT}
          error={form.formState.errors.name?.message}
          register={form.register("name")}
        />
        <Field
          id="organizationName"
          label="Workspace name"
          type="text"
          autoComplete="organization"
          hint="Your company or team. Shown in the top bar."
          className={AUTH_FIELD}
          inputClassName={AUTH_INPUT}
          error={form.formState.errors.organizationName?.message}
          register={form.register("organizationName")}
        />
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
          autoComplete="new-password"
          reveal
          hint={PASSWORD_POLICY}
          className={AUTH_FIELD}
          inputClassName={AUTH_INPUT}
          error={form.formState.errors.password?.message}
          register={form.register("password")}
        />

        {form.formState.errors.root && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-neg/30 bg-neg/5 p-2.5 text-[12px] text-neg"
          >
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{form.formState.errors.root.message}</span>
          </div>
        )}

        <button
          type="submit"
          className={AUTH_SUBMIT}
          disabled={signup.isPending}
          aria-busy={signup.isPending}
        >
          {signup.isPending ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Creating workspace
            </span>
          ) : (
            "Create workspace"
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
