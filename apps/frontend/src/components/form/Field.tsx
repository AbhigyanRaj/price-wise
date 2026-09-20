import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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
  /** Reaches the input itself rather than the wrapper.
   *
   *  `className` lands on the surrounding div, so without this there is no way
   *  to restyle the control. The auth screens need it because ui/input.tsx is
   *  still stock shadcn: its `border-input` resolves to the input SURFACE
   *  colour, which is white on the paper theme, so the border is invisible. */
  inputClassName?: string | undefined;
  /** Adds a show/hide toggle and owns the input's `type`.
   *
   *  Opt-in rather than inferred from `type === "password"`, because a field
   *  that is a password in the schema sense is not always one a user should be
   *  invited to display: this belongs on a sign-in form, not on a shared
   *  screen showing someone else's credential. */
  reveal?: boolean | undefined;
}

export function Field({
  id,
  label,
  register,
  error,
  hint,
  className,
  inputClassName,
  reveal = false,
  type,
  ...inputProps
}: FieldProps) {
  const [shown, setShown] = useState(false);

  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          // Owned here when revealable, so the toggle actually changes it.
          type={reveal && shown ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          // Room for the toggle, so a long value never runs under it.
          className={cn(inputClassName, reveal && "pr-10")}
          {...inputProps}
          {...register}
        />
        {reveal && (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            // The label states the ACTION, not the state. "Show password" as a
            // name plus aria-pressed is the pattern screen reader users expect
            // from a toggle, and it never reads as a contradiction the way a
            // static name with a changing icon does.
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            aria-controls={id}
            className={cn(
              "absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center",
              "rounded-md text-t4 transition-colors duration-150 hover:bg-hover hover:text-t0",
            )}
          >
            {shown ? (
              <EyeOff size={15} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Eye size={15} strokeWidth={1.5} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-[12px] text-t4">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[12px] text-neg">
          {error}
        </p>
      )}
    </div>
  );
}
