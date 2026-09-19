import { useEffect, useRef } from "react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { ErrorState } from "@/components/data/States";

/**
 * The last line of defence for a render that threw.
 *
 * Distinguishes a thrown Error from a router response so the message is the
 * real one rather than a generic apology, and always offers both a retry and a
 * way home: every error state owes the user a recovery action.
 */
export function RouteError() {
  const error = useRouteError();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus(), []);

  const description = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "Something failed while rendering this screen.";

  return (
    <div className="noise grid min-h-dvh place-items-center bg-bg px-[34px]">
      <div role="alert" className="w-full max-w-md">
        <h1 ref={heading} tabIndex={-1} className="sr-only">
          This screen failed to load
        </h1>
        <ErrorState
          title="This screen failed to load"
          description={description}
          // A full reload rather than a router retry: the component tree is in
          // an unknown state, and re-rendering it is what just failed.
          onRetry={() => window.location.reload()}
        />
        <p className="mt-2 text-center text-[12.5px] text-t3">
          <Link to="/" className="text-acc-t2 underline-offset-2 hover:underline">
            Back to overview
          </Link>
        </p>
      </div>
    </div>
  );
}
