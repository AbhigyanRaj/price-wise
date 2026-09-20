import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Radix, not the hand-rolled overlay used elsewhere.
 *
 * The existing RejectDialog has role="dialog", an Escape listener and initial
 * focus, but no focus trap, no portal, no scroll lock and no focus restore to
 * the trigger. Reimplementing those correctly for a seven-field product form
 * is exactly the clever-code-at-10pm hazard worth avoiding, and `radix-ui` is
 * already a dependency imported by button.tsx and label.tsx, so this adds
 * nothing to install.
 *
 * Hand-written rather than generated: the shadcn CLI emits
 * `@radix-ui/react-dialog` imports, which WOULD add a package. The unified
 * entry point is the one this repo already uses.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  children,
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-[3px] data-[state=open]:animate-[pwIn_160ms_var(--ease-spatial)]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-24px)] max-w-lg -translate-x-1/2 -translate-y-1/2 sm:w-full",
          "max-h-[calc(100dvh-48px)] overflow-y-auto rounded-card border border-line3 bg-raised p-4 shadow-[var(--sh-pop)] sm:p-5",
          "data-[state=open]:animate-[pwPal_140ms_var(--ease-spatial)]",
          "max-h-[85vh] overflow-y-auto",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute right-3.5 top-3.5 rounded-sm p-1 text-t4 transition-colors duration-[110ms] hover:bg-hover hover:text-t1"
        >
          <X size={14} strokeWidth={1.4} aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 pr-8">{children}</div>;
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-[16px] font-semibold tracking-[-0.015em] text-t0", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("mt-1 text-[12.5px] leading-[1.6] text-t3", className)}
      {...props}
    />
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex items-center justify-end gap-2">{children}</div>;
}
