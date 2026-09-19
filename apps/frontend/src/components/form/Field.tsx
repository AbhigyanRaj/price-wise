import type { UseFormRegisterReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";

/**
 * One labelled input, with the error and hint wiring that is easy to forget.
 *
 * Lifted out of LoginPage, where it was typed to that one form's values and so
 * could not be reused. `UseFormRegisterReturn` is not parameterised by the
 * form's value type, which is the whole reason one component can now serve
 * every form in the app.
 *
 * The accessibility wiring is the point of having this at all: `aria-invalid`
 * and an `aria-describedby` that names both the hint and the error, so a screen
 * reader reads them with the field rather than leaving them stranded elsewhere
 * in the DOM. Duplicating that per form is a chance to drop it per form.
 */
export interface FieldProps extends Omit<React.ComponentProps<"input">, "id"> {
  id: string;
  label: string;
  register: UseFormRegisterReturn;
  error?: string | undefined;
  /** Static guidance shown before submission, not a validation result.
   *  Requirements stated up front are WCAG 3.3.2; a password policy revealed
   *  one rule at a time costs the user a round trip per rule. */
  hint?: string | undefined;
  className?: string | undefined;
}

export function Field({ id, label, register, error, hint, className, ...inputProps }: FieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...inputProps}
        {...register}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-[12px] text-ink-tertiary">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[12px] text-down">
          {error}
        </p>
      )}
    </div>
  );
}
