import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { InviteSignupSchema, type InviteSignupInput } from "@pricewise/shared";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/form/Field";
import { FullPageSpinner } from "@/components/data/States";
import { applyServerErrors } from "@/lib/formErrors";
import { AuthLayout } from "./AuthLayout";
import { useInviteSignup } from "./api";
import { useAuth } from "./useAuth";

const PASSWORD_POLICY = "At least 10 characters, with an uppercase letter, a lowercase letter and a digit.";

/**
 * Redeems an invite code.
 *
 * The other half of the flow that already existed in Settings: an admin could
 * mint a code and copy it, and there was nowhere to take it. A feature that
 * hands the user a token with no door to put it in is worse than one that is
 * simply absent.
 *
 * The code is prefilled from ?code= but the EMAIL deliberately is not. The
 * invite is bound to an address on the server, and a shareable link that also
 * carried the address would hand it to whoever holds the link.
 */
export function InviteSignupPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const [params] = useSearchParams();
  const join = useInviteSignup();
  const navigate = useNavigate();

  const form = useForm<InviteSignupInput>({
    resolver: zodResolver(InviteSignupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      inviteCode: (params.get("code") ?? "").toUpperCase(),
    },
  });

  if (isLoading) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <AuthLayout
      title="Join a workspace"
      subtitle="Enter the code your admin sent you, and the email address they invited."
      footer={
        <>
          <p>
            Need a workspace of your own?{" "}
            <Link to="/signup" className="text-acc-t2 underline-offset-2 hover:underline">
              Create one
            </Link>
          </p>
          <p className="mt-1">
            Already have an account?{" "}
            <Link to="/login" className="text-acc-t2 underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
        </>
      }
    >
      <form
        onSubmit={form.handleSubmit((values) =>
          join.mutate(values, {
            onSuccess: () => navigate("/", { replace: true }),
            onError: (error) =>
              applyServerErrors(form, error, {
                fallback: "Could not join the workspace. Please try again.",
                codeToField: {
                  INVITE_INVALID: "inviteCode",
                  NOT_FOUND: "inviteCode",
                  EMAIL_IN_USE: "email",
                },
              }),
          }),
        )}
        className="space-y-4"
        noValidate
      >
        <Field
          id="inviteCode"
          label="Invite code"
          type="text"
          autoComplete="off"
          maxLength={12}
          hint="12 characters, from your invitation."
          error={form.formState.errors.inviteCode?.message}
          // Codes are generated from an uppercase alphabet, so normalising
          // here stops a lowercase paste reading as an invalid code.
          register={form.register("inviteCode", {
            setValueAs: (value: string) => value.trim().toUpperCase(),
          })}
        />
        <Field
          id="name"
          label="Your name"
          type="text"
          autoComplete="name"
          error={form.formState.errors.name?.message}
          register={form.register("name")}
        />
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="username"
          hint="Must match the address the invite was issued to."
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

        {form.formState.errors.inviteCode?.type === "server" && (
          <p className="text-[12px] text-t4">
            Codes expire. Ask an admin in that workspace to issue you a new one.
          </p>
        )}

        <Button type="submit" className="w-full" disabled={join.isPending} aria-busy={join.isPending}>
          {join.isPending ? "Joining" : "Join workspace"}
        </Button>
      </form>
    </AuthLayout>
  );
}
