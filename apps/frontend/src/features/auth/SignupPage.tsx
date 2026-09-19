import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router";
import { SignupSchema, type SignupInput } from "@pricewise/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/form/Field";
import { FullPageSpinner } from "@/components/data/States";
import { applyServerErrors } from "@/lib/formErrors";
import { AuthLayout } from "./AuthLayout";
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
      title="Create a workspace"
      subtitle="You will be its first admin. Invite the rest of your pricing team afterwards."
      footer={
        <>
          <p>
            Already have an account?{" "}
            <Link to="/login" className="text-acc-t2 underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
          <p className="mt-1">
            Have an invite code?{" "}
            <Link to="/join" className="text-acc-t2 underline-offset-2 hover:underline">
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
          error={form.formState.errors.name?.message}
          register={form.register("name")}
        />
        <Field
          id="organizationName"
          label="Workspace name"
          type="text"
          autoComplete="organization"
          hint="Your company or team. Shown in the top bar."
          error={form.formState.errors.organizationName?.message}
          register={form.register("organizationName")}
        />
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
          autoComplete="new-password"
          hint={PASSWORD_POLICY}
          error={form.formState.errors.password?.message}
          register={form.register("password")}
        />

        {form.formState.errors.root && (
          <p role="alert" className="text-[12.5px] text-neg">
            {form.formState.errors.root.message}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={signup.isPending} aria-busy={signup.isPending}>
          {signup.isPending ? "Creating workspace" : "Create workspace"}
        </Button>
      </form>
    </AuthLayout>
  );
}
