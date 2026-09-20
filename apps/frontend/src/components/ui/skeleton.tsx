import { cn } from "@/lib/cn";

/**
 * Rewritten onto this project's tokens.
 *
 * It asked for `bg-accent`, which is not a token here, so no utility was
 * emitted and every skeleton in the app rendered with no background: a
 * pulsing rectangle of nothing. CLAUDE.md §7 requires skeletons that match the
 * real layout, and they were invisible instead.
 *
 * A shimmer rather than a pulse. A pulse reads as "waiting"; a shimmer reads
 * as "loading", which is the more honest thing to say while a request is
 * actually in flight.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("shimmer rounded-sm bg-line2", className)}
      {...props}
    />
  );
}

export { Skeleton };
