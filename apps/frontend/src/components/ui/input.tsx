import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Rewritten onto this project's tokens, for the same reason as button.tsx.
 *
 * The subtle one here: `border-input` DID resolve, because `--color-input` is
 * a real token. It just resolves to the field's own SURFACE colour, which is
 * `#0c0c10` in dark and `#ffffff` in light, so the border was a near-black
 * line on a near-black panel or white on white. The field looked like it had
 * no edge at all, which is why every auth input needed an override.
 *
 * `text-base md:text-sm` is kept deliberately and is not a type choice: iOS
 * Safari zooms the viewport when a focused input is under 16px.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-border bg-input px-2.5 py-1",
        "text-base text-t0 md:text-[13px]",
        "placeholder:text-t4 selection:bg-acc selection:text-on-acc",
        "transition-colors duration-[110ms] hover:border-border-strong",
        "focus:border-acc/50 focus-visible:border-acc/50",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-t1",
        "aria-invalid:border-neg-border",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
