import { z } from "zod";

// The password policy lives here, not in the API, so the signup form and the
// server enforce byte-identical rules from one definition.
export const PasswordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128, "Password must be at most 128 characters")
  .refine((v) => /[a-z]/.test(v), "Must contain a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Must contain an uppercase letter")
  .refine((v) => /[0-9]/.test(v), "Must contain a digit");

// Normalise BEFORE validating, then pipe into the format check. Order matters:
// z.email() rejects surrounding whitespace, so trimming afterwards would never
// run. Both transforms execute on client and server, so " Alice@Example.COM "
// and "alice@example.com" cannot become two accounts.
export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(255));

export const SignupSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  name: z.string().min(1).max(120).trim(),
  organizationName: z.string().min(2).max(120).trim(),
});

export const InviteSignupSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  name: z.string().min(1).max(120).trim(),
  inviteCode: z.string().length(12),
});

export const LoginSchema = z.object({
  email: EmailSchema,
  // Deliberately not PasswordSchema: an existing account may predate a policy
  // change, and rejecting its password at the schema level would lock the user
  // out with a validation error instead of an authentication failure.
  password: z.string().min(1),
});

export type SignupInput = z.infer<typeof SignupSchema>;
export type InviteSignupInput = z.infer<typeof InviteSignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
