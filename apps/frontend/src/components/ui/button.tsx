import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/cn";

/**
 * Rewritten onto this project's tokens.
 *
 * It shipped as stock shadcn asking for `bg-primary`,
 * `text-primary-foreground`, `bg-accent` and `ring-ring`. None of those are
 * declared in index.css, and Tailwind v4 only emits a utility for a theme key
 * that exists, so every one of those class names was a dead string. The
 * visible symptom was that the primary button had no fill at all: "Save
 * changes" on Settings and "Sign in" on the login screen rendered as bare
 * text. Confirmed against the built stylesheet, which contained zero
 * occurrences of `primary`, `destructive`, `muted` or `secondary`.
 *
 * `outline-none` is gone too. index.css declares one focus spec for the whole
 * app and states that it is never removed; a utility on this component beat
 * that base rule and quietly stripped the ring from every button.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-md text-[13px] font-medium",
    // Colour and transform, so the press has physical feedback. 0.97 is
    // small enough to read as a button depressing rather than as a bounce.
    "transition-[color,background-color,border-color,transform] duration-[110ms]",
    "active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  ].join(" "),
  {
    variants: {
      variant: {
        // Inverted ink, not the accent, and the same primary the sign-in
        // screen uses. One accent per screen: it is spent on focus, the
        // active nav bar and the pending pill, so the primary button earns
        // its prominence from contrast rather than hue. It also means the
        // button never competes with a green or red price movement beside it.
        default: "bg-t0 text-bg hover:opacity-90",
        // For the rare case where a control must read as the accent itself.
        accent: "bg-acc text-on-acc hover:bg-acc-hover",
        // The word carries the meaning, so this stays a quiet surface with
        // negative text rather than a wall of red.
        destructive: "border border-neg-border bg-neg-a text-neg hover:bg-neg/15",
        outline: "border border-border bg-ctl text-t1 hover:border-border-strong hover:bg-ctl-hover",
        secondary: "bg-ctl text-t1 hover:bg-ctl-hover",
        ghost: "text-t3 hover:bg-hover hover:text-t1",
        link: "text-acc-t2 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3 has-[>svg]:px-2.5",
        xs: "h-6 rounded-sm px-2 text-[11.5px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 px-2.5 text-[12.5px] has-[>svg]:px-2",
        lg: "h-9 px-5",
        icon: "size-8",
        "icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
