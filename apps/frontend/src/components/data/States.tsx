import { AlertTriangle, Compass, Inbox, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The three states every async surface owes the user, in one place so no
 * screen invents its own.
 *
 * The important one is that "nothing here yet" and "nothing matches your
 * filter" are different components. They are different situations: one needs
 * an onboarding action, the other needs a way back out of a filter. Collapsing
 * them into one generic "No results" is the commonest empty-state mistake.
 */

export function FullPageSpinner() {
  return (
    <div className="grid min-h-[50vh] place-items-center" role="status" aria-label="Loading">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand" />
    </div>
  );
}

/**
 * Optional props are declared `?: T | undefined` rather than plain `?: T`.
 *
 * Under exactOptionalPropertyTypes an absent key and a key set to undefined
 * are different types, and React components pass optional props straight
 * through all the time. Writing the union once here is the convention used for
 * every component in this app; the alternative is a conditional spread at
 * every call site, which is noise.
 */
interface EmptyProps {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void } | undefined;
  className?: string | undefined;
}

/** Nothing exists yet. Offers the action that creates the first one. */
export function EmptyFirstRun({ title, description, action, className }: EmptyProps) {
  return (
    <Shell className={className}>
      <Inbox className="h-8 w-8 text-ink-tertiary" aria-hidden="true" />
      <Body title={title} description={description} action={action} />
    </Shell>
  );
}

/** Things exist, but the current filter excludes all of them. Offers a way
 *  back rather than an onboarding action the user does not need. */
export function EmptyNoMatches({ title, description, action, className }: EmptyProps) {
  return (
    <Shell className={className}>
      <SearchX className="h-8 w-8 text-ink-tertiary" aria-hidden="true" />
      <Body title={title} description={description} action={action} />
    </Shell>
  );
}

export function ErrorState({
  title = "Could not load this",
  description,
  onRetry,
  className,
}: {
  title?: string | undefined;
  description: string;
  onRetry?: (() => void) | undefined;
  className?: string | undefined;
}) {
  return (
    <Shell className={className}>
      <AlertTriangle className="h-8 w-8 text-warn" aria-hidden="true" />
      <Body
        title={title}
        description={description}
        {...(onRetry ? { action: { label: "Try again", onClick: onRetry } } : {})}
      />
    </Shell>
  );
}

/**
 * A route that does not exist.
 *
 * Lives here with the other three because this file's stated job is the states
 * every surface owes the user, and a route miss is the fourth. Putting it
 * anywhere else invites a hand-rolled variant.
 */
export function NotFound({
  path,
  action,
  className,
}: {
  path?: string | undefined;
  action?: { label: string; onClick: () => void } | undefined;
  className?: string | undefined;
}) {
  return (
    <Shell className={className}>
      <Compass className="h-8 w-8 text-ink-tertiary" aria-hidden="true" />
      <Body
        title="There is nothing at this address"
        description={
          path
            ? `We could not find ${path}. It may have been renamed or removed.`
            : "The page you asked for does not exist."
        }
        action={action}
      />
    </Shell>
  );
}

function Shell({ children, className }: { children: React.ReactNode; className?: string | undefined }) {
  return (
    <div
      // Announced politely, because these appear after an async filter and a
      // screen-reader user would otherwise get no feedback that the list
      // changed at all.
      aria-live="polite"
      className={cn("flex flex-col items-center gap-3 px-6 py-16 text-center", className)}
    >
      {children}
    </div>
  );
}

function Body({ title, description, action }: Omit<EmptyProps, "className">) {
  return (
    <>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-[13px] text-ink-secondary">{description}</p>
      </div>
      {action && (
        <Button size="sm" variant="outline" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </>
  );
}
