import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { ApiError } from "./api";

/**
 * Puts a server rejection back where the user can act on it.
 *
 * The backend has emitted field-level errors since it was written:
 * `middleware/validate.ts` flattens a Zod failure into `details.fieldErrors`,
 * and `product.service.ts` adds them by hand for cross-field rules. Nothing on
 * the client had ever read them, so every server rejection surfaced as one
 * banner at the top of the form and the user had to guess which input was
 * wrong.
 *
 * Order matters here. A field-level message is the most useful thing we can
 * show, so it wins; a form-level message is next; the raw error message is the
 * fallback.
 */
export function applyServerErrors<T extends FieldValues>(
  form: UseFormReturn<T>,
  error: unknown,
  opts: {
    /** Shown when the error is not an ApiError at all, e.g. the network died. */
    fallback: string;
    /** Maps a non-validation error code onto the input it concerns, so a 409
     *  duplicate SKU lands on the SKU field rather than in a banner. */
    codeToField?: Partial<Record<string, Path<T>>>;
  },
): void {
  if (!(error instanceof ApiError)) {
    form.setError("root", { message: opts.fallback });
    return;
  }

  const fieldErrors = error.fieldErrors;
  const names = Object.keys(fieldErrors);

  if (names.length > 0) {
    names.forEach((name, index) => {
      const message = fieldErrors[name]?.[0];
      if (!message) return;
      form.setError(
        name as Path<T>,
        { type: "server", message },
        // Focus the first rejected field only. Focusing each in turn would
        // leave the cursor on whichever happened to be last.
        index === 0 ? { shouldFocus: true } : undefined,
      );
    });
    return;
  }

  const mapped = opts.codeToField?.[error.code];
  if (mapped) {
    form.setError(mapped, { type: "server", message: error.message }, { shouldFocus: true });
    return;
  }

  const formErrors = error.details?.formErrors;
  const violations = error.details?.violations;

  const message =
    formErrors && formErrors.length > 0
      ? formErrors.join(" ")
      : violations && violations.length > 0
        ? violations.map((v) => v.detail).join(" ")
        : error.message;

  form.setError("root", { message });
}
